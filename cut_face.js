
(function() {
    // most of the code here is just copied from 
    // https://github.com/JannisX11/blockbench/blob/f7f7c002059c92b3516e71fb129d0be91352ff34/js/modeling/mesh_editing.js#L1407
    // all i did was remove a few lines to prevent it from loop cutting
    
    var button;

    BBPlugin.register('cut_face', {
        title: 'Cut Face',
        author: 'Onusai',
        icon: 'carpenter',
        description: 'Cut a single face',
        version: '1.0.0',
        variant: 'desktop',
        
        onload() {
            button = new Action('cut_face', {
                icon: 'carpenter',
                name: 'Cut Face',
                category: 'edit',
                keybind: new Keybind(),
                condition: {modes: ['edit'], features: ['meshes'], method: () => (Mesh.selected[0] && Mesh.selected[0].getSelectedVertices().length > 1)},
                click() {
                    let selected_face, selected_face_key;
                    let saved_direction = 0;
                    Mesh.selected.forEach(mesh => {
                        if (!selected_face) {
                            selected_face_key = mesh.getSelectedFaces()[0];
                            selected_face = mesh.faces[selected_face_key];
                        }
                    })
                    function getLength(direction = 0) {
                        selected_face = Mesh.selected.last().faces[selected_face_key];
                        if (selected_face) {
                            let vertices = selected_face.getSortedVertices();
                            let pos1 = Mesh.selected[0].vertices[vertices[(0 + direction) % selected_face.vertices.length]];
                            let pos2 = Mesh.selected[0].vertices[vertices[(1 + direction) % selected_face.vertices.length]];
                            return Math.sqrt(Math.pow(pos2[0] - pos1[0], 2) + Math.pow(pos2[1] - pos1[1], 2) + Math.pow(pos2[2] - pos1[2], 2));
                        } else {
                            let vertices = Mesh.selected[0].getSelectedVertices();
                            let pos1 = Mesh.selected[0].vertices[vertices[0]];
                            let pos2 = Mesh.selected[0].vertices[vertices[1]];
                            return Math.sqrt(Math.pow(pos2[0] - pos1[0], 2) + Math.pow(pos2[1] - pos1[1], 2) + Math.pow(pos2[2] - pos1[2], 2));
                        }
                    }
                    let length = getLength();
        
                    function runEdit(amended, offset, direction = 0, cuts = 1) {
                        Undo.initEdit({elements: Mesh.selected, selection: true}, amended);
                        if (offset == undefined) offset = length / (cuts+1);
                        Mesh.selected.forEach(mesh => {
                            let selected_vertices = mesh.getSelectedVertices();
                            let start_face;
                            let start_face_quality = 1;
                            for (let fkey in mesh.faces) {
                                let face = mesh.faces[fkey];
                                if (face.vertices.length < 2) continue;
                                let vertices = face.vertices.filter(vkey => selected_vertices.includes(vkey))
                                if (vertices.length > start_face_quality) {
                                    start_face = face;
                                    start_face_quality = vertices.length;
                                }
                            }
                            if (!start_face) return;
                            let processed_faces = [start_face];
                            let center_vertices_map = {};
        
                            function getCenterVertex(vertices, ratio) {
                                let edge_key = vertices.slice().sort().join('.');
                                let existing_key = center_vertices_map[edge_key];
                                if (existing_key) return existing_key;
        
                                let vector = mesh.vertices[vertices[0]].map((v, i) => Math.lerp(v, mesh.vertices[vertices[1]][i], ratio))
                                let [vkey] = mesh.addVertices(vector);
                                center_vertices_map[edge_key] = vkey;
                                return vkey;
                            }
        
                            function splitFace(face, side_vertices, double_side, cut_no) {
                                processed_faces.push(face);
                                let sorted_vertices = face.getSortedVertices();
        
                                let side_index_diff = sorted_vertices.indexOf(side_vertices[0]) - sorted_vertices.indexOf(side_vertices[1]);
                                if (side_index_diff == -1 || side_index_diff > 2) side_vertices.reverse();
        
                                if (face.vertices.length == 4) {
        
                                    let opposite_vertices = sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
                                    let opposite_index_diff = sorted_vertices.indexOf(opposite_vertices[0]) - sorted_vertices.indexOf(opposite_vertices[1]);
                                    if (opposite_index_diff == 1 || opposite_index_diff < -2) opposite_vertices.reverse();
        
                                    let ratio = offset/length;
                                    if (cuts > 1) {
                                        ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
                                    }
                                    let center_vertices = [
                                        getCenterVertex(side_vertices, ratio),
                                        getCenterVertex(opposite_vertices, ratio)
                                    ]
        
                                    let c1_uv_coords = [
                                        Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
                                        Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
                                    ];
                                    let c2_uv_coords = [
                                        Math.lerp(face.uv[opposite_vertices[0]][0], face.uv[opposite_vertices[1]][0], ratio),
                                        Math.lerp(face.uv[opposite_vertices[0]][1], face.uv[opposite_vertices[1]][1], ratio),
                                    ];
        
                                    let new_face = new MeshFace(mesh, face).extend({
                                        vertices: [side_vertices[1], center_vertices[0], center_vertices[1], opposite_vertices[1]],
                                        uv: {
                                            [side_vertices[1]]: face.uv[side_vertices[1]],
                                            [center_vertices[0]]: c1_uv_coords,
                                            [center_vertices[1]]: c2_uv_coords,
                                            [opposite_vertices[1]]: face.uv[opposite_vertices[1]],
                                        }
                                    })
                                    face.extend({
                                        vertices: [opposite_vertices[0], center_vertices[0], center_vertices[1], side_vertices[0]],
                                        uv: {
                                            [opposite_vertices[0]]: face.uv[opposite_vertices[0]],
                                            [center_vertices[0]]: c1_uv_coords,
                                            [center_vertices[1]]: c2_uv_coords,
                                            [side_vertices[0]]: face.uv[side_vertices[0]],
                                        }
                                    })
                                    mesh.addFaces(new_face);
        
                                    // Multiple loop cuts
                                    if (cut_no+1 < cuts) {
                                        splitFace(face, [center_vertices[0], side_vertices[0]], double_side, cut_no+1);
                                    }
        
                                    return;
                                    if (cut_no != 0) return;
                                    // Find next (and previous) face
                                    // for (let fkey in mesh.faces) {
                                    //     let ref_face = mesh.faces[fkey];
                                    //     if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
                                    //     let vertices = ref_face.vertices.filter(vkey => opposite_vertices.includes(vkey))
                                    //     if (vertices.length >= 2) {
                                    //         splitFace(ref_face, opposite_vertices, ref_face.vertices.length == 4, 0);
                                    //         break;
                                    //     }
                                    // }
        
                                    if (double_side) {
                                        for (let fkey in mesh.faces) {
                                            let ref_face = mesh.faces[fkey];
                                            if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
                                            let vertices = ref_face.vertices.filter(vkey => side_vertices.includes(vkey))
                                            if (vertices.length >= 2) {
                                                let ref_sorted_vertices = ref_face.getSortedVertices();
                                                let ref_opposite_vertices = ref_sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
                                                
                                                if (ref_opposite_vertices.length == 2) {
                                                    splitFace(ref_face, ref_opposite_vertices, ref_face.vertices.length == 4, 0);
                                                    break;
                                                } else if (ref_opposite_vertices.length == 1) {
                                                    splitFace(ref_face, side_vertices, false, 0);
                                                    break;
                                                }
                                            }
                                        }
                                    }
        
                                } else if (face.vertices.length == 3) {
                                    if (direction > 2) {
                                        // Split tri from edge to edge
        
                                        let opposed_vertex = sorted_vertices.find(vkey => !side_vertices.includes(vkey));
                                        let opposite_vertices = [opposed_vertex, side_vertices[direction % side_vertices.length]];
        
                                        let opposite_index_diff = sorted_vertices.indexOf(opposite_vertices[0]) - sorted_vertices.indexOf(opposite_vertices[1]);
                                        if (opposite_index_diff == 1 || opposite_index_diff < -2) opposite_vertices.reverse();
        
                                        let ratio = offset/length;
                                        if (cuts > 1) {
                                            ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
                                        }
                                        let center_vertices = [
                                            getCenterVertex(side_vertices, ratio),
                                            getCenterVertex(opposite_vertices, ratio)
                                        ]
        
                                        let c1_uv_coords = [
                                            Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
                                            Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
                                        ];
                                        let c2_uv_coords = [
                                            Math.lerp(face.uv[opposite_vertices[0]][0], face.uv[opposite_vertices[1]][0], ratio),
                                            Math.lerp(face.uv[opposite_vertices[0]][1], face.uv[opposite_vertices[1]][1], ratio),
                                        ];
        
                                        let other_quad_vertex = side_vertices.find(vkey => !opposite_vertices.includes(vkey));
                                        let other_tri_vertex = side_vertices.find(vkey => opposite_vertices.includes(vkey));
                                        let new_face = new MeshFace(mesh, face).extend({
                                            vertices: [other_tri_vertex, center_vertices[0], center_vertices[1]],
                                            uv: {
                                                [other_tri_vertex]: face.uv[other_tri_vertex],
                                                [center_vertices[0]]: c1_uv_coords,
                                                [center_vertices[1]]: c2_uv_coords,
                                            }
                                        })
                                        if (new_face.getAngleTo(face) > 90) {
                                            new_face.invert();
                                        }
                                        face.extend({
                                            vertices: [opposed_vertex, center_vertices[0], center_vertices[1], other_quad_vertex],
                                            uv: {
                                                [opposed_vertex]: face.uv[opposed_vertex],
                                                [center_vertices[0]]: c1_uv_coords,
                                                [center_vertices[1]]: c2_uv_coords,
                                                [other_quad_vertex]: face.uv[other_quad_vertex],
                                            }
                                        })
                                        if (face.getAngleTo(new_face) > 90) {
                                            face.invert();
                                        }
                                        mesh.addFaces(new_face);
        
                                        // Multiple loop cuts
                                        if (cut_no+1 < cuts) {
                                            splitFace(face, [center_vertices[0], other_quad_vertex], double_side, cut_no+1);
                                        }
        
                                        return;
                                        if (cut_no != 0) return;
                                        // Find next (and previous) face
                                        // for (let fkey in mesh.faces) {
                                        //     let ref_face = mesh.faces[fkey];
                                        //     if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
                                        //     let vertices = ref_face.vertices.filter(vkey => opposite_vertices.includes(vkey))
                                        //     if (vertices.length >= 2) {
                                        //         splitFace(ref_face, opposite_vertices, ref_face.vertices.length == 4, 0);
                                        //         break;
                                        //     }
                                        // }
        
                                        if (double_side) {
                                            for (let fkey in mesh.faces) {
                                                let ref_face = mesh.faces[fkey];
                                                if (ref_face.vertices.length < 3 || processed_faces.includes(ref_face)) continue;
                                                let vertices = ref_face.vertices.filter(vkey => side_vertices.includes(vkey))
                                                if (vertices.length >= 2) {
                                                    let ref_sorted_vertices = ref_face.getSortedVertices();
                                                    let ref_opposite_vertices = ref_sorted_vertices.filter(vkey => !side_vertices.includes(vkey));
                                                    
                                                    if (ref_opposite_vertices.length == 2) {
                                                        splitFace(ref_face, ref_opposite_vertices, ref_face.vertices.length == 4, 0);
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        let opposite_vertex = sorted_vertices.find(vkey => !side_vertices.includes(vkey));
        
                                        let ratio = offset/length;
                                        if (cuts > 1) {
                                            ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
                                        }
                                        let center_vertex = getCenterVertex(side_vertices, ratio);
        
                                        let c1_uv_coords = [
                                            Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
                                            Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
                                        ];
        
                                        let new_face = new MeshFace(mesh, face).extend({
                                            vertices: [side_vertices[1], center_vertex, opposite_vertex],
                                            uv: {
                                                [side_vertices[1]]: face.uv[side_vertices[1]],
                                                [center_vertex]: c1_uv_coords,
                                                [opposite_vertex]: face.uv[opposite_vertex],
                                            }
                                        })
                                        face.extend({
                                            vertices: [opposite_vertex, center_vertex, side_vertices[0]],
                                            uv: {
                                                [opposite_vertex]: face.uv[opposite_vertex],
                                                [center_vertex]: c1_uv_coords,
                                                [side_vertices[0]]: face.uv[side_vertices[0]],
                                            }
                                        })
                                        if (direction % 3 == 2) {
                                            new_face.invert();
                                            face.invert();
                                        }
                                        mesh.addFaces(new_face);
                                    }
                                } else if (face.vertices.length == 2) {
        
                                    let ratio = offset/length;
                                    if (cuts > 1) {
                                        ratio = 1 - (1 / (cuts + 1 - cut_no) * ratio * 2);
                                    }
                                    let center_vertex = getCenterVertex(side_vertices, ratio);
        
                                    let c1_uv_coords = [
                                        Math.lerp(face.uv[side_vertices[0]][0], face.uv[side_vertices[1]][0], ratio),
                                        Math.lerp(face.uv[side_vertices[0]][1], face.uv[side_vertices[1]][1], ratio),
                                    ];
        
                                    let new_face = new MeshFace(mesh, face).extend({
                                        vertices: [side_vertices[1], center_vertex],
                                        uv: {
                                            [side_vertices[1]]: face.uv[side_vertices[1]],
                                            [center_vertex]: c1_uv_coords,
                                        }
                                    })
                                    face.extend({
                                        vertices: [center_vertex, side_vertices[0]],
                                        uv: {
                                            [center_vertex]: c1_uv_coords,
                                            [side_vertices[0]]: face.uv[side_vertices[0]],
                                        }
                                    })
                                    mesh.addFaces(new_face);
                                }
                            }
        
                            let start_vertices = start_face.getSortedVertices().filter((vkey, i) => selected_vertices.includes(vkey));
                            let start_edge = [start_vertices[direction % start_vertices.length], start_vertices[(direction+1) % start_vertices.length]];
                            if (start_edge.length == 1) start_edge.splice(0, 0, start_vertices[0]);
        
                            splitFace(start_face, start_edge, start_face.vertices.length == 4 || direction > 2, 0);
        
                            selected_vertices.empty();
                            for (let key in center_vertices_map) {
                                selected_vertices.safePush(center_vertices_map[key]);
                            }
                        })
                        Undo.finishEdit('Create loop cut')
                        Canvas.updateView({elements: Mesh.selected, element_aspects: {geometry: true, uv: true, faces: true}, selection: true})
                    }
        
                    runEdit();
        
                    Undo.amendEdit({
                        direction: {type: 'number', value: 0, label: 'edit.loop_cut.direction', condition: !!selected_face, min: 0},
                        cuts: {type: 'number', value: 1, label: 'edit.loop_cut.cuts', min: 0, max: 16},
                        offset: {type: 'number', value: length/2, label: 'edit.loop_cut.offset', min: 0, max: length, interval_type: 'position'},
                    }, (form, form_options) => {
                        let direction = form.direction || 0;
                        length = getLength(direction);
        
                        form_options.offset.slider.settings.max = length;
                        if(saved_direction !== direction)
                        {
                            form_options.offset.slider.value = length/2;
                            form_options.offset.slider.update();
                            saved_direction = direction;
                        }
                        
                        runEdit(true, form_options.offset.slider.value, form_options.direction ? direction : 0, form.cuts);
                    })
                }
            })
            MenuBar.addAction(button, 'edit');
            
        },
        onunload() {
            button.delete();
        }
    });

})();