"""
Bouwt de 3D-modellen voor de extra levels (woestijn, sneeuw, dorp, haven) en exporteert ze als .glb.

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/build_levels.py

Assen: Blender is Z-omhoog, de glTF-export zet dat om naar Y-omhoog. Blender-X = game-X,
Blender-Y = game -Z. Oorsprong van elk model = midden onderkant (z=0 = grond).

Contract met public/shared.js (PROP_DIMS) en public/game.js (niet veranderen zonder beide aan te passen):
  container.glb : 6.06 x 2.44 x 2.59 (lengte langs X). Materiaal 'ContainerPaint' wordt per exemplaar gekleurd.
  barrel.glb    : olievat r=0.29, h=0.9. Materiaal 'BarrelPaint' wordt per exemplaar gekleurd.
  jersey.glb    : betonnen wegversperring 2.0 x 0.6 x 0.82.
  lamp.glb      : lantaarnpaal 7.5 m, paal op de oorsprong, lamp 1.3 m opzij (+X). Materiaal 'LampGlow' gloeit.
  crane.glb     : portaalkraan, poten op (+-7, +-5), 16 m hoog.
  cabin.glb     : (zie tools/build_buildings.py - holle blokhut met deur, ramen en meubels)
  snowpine.glb  : besneeuwde den: 'trunk' + 'foliage' (vertexkleuren), ~10 m hoog.
  palm.glb      : palmboom ~8.5 m.
  rubble.glb    : puinhoop (decoratie) ~2.6 m breed.
  car.glb       : uitgebrand autowrak 4.3 x 1.9 x 1.45.
  logs.glb      : houtstapel / barricade 3.0 x 1.1 x 1.0 met sneeuw.
  ship.glb      : vrachtschip (decoratie, ver weg) ~150 m lang.
  shrub.glb     : droge struik (decoratie).
"""
import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
os.makedirs(OUT, exist_ok=True)
random.seed(11)
np.random.seed(11)


# ---------------------------------------------------------------- basis (gekopieerd uit build_models.py)

def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def make_image(name, rgb):
    """rgb: numpy array (h, w, 3) met waarden 0..1 (rij 0 = onderkant) -> verpakte Blender-afbeelding."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


_mats = {}


def material(name, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0, image=None, vcol=False,
             emit=None, emit_strength=1.0, double=False):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif vcol:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    if emit is not None:
        for nm in ('Emission Color', 'Emission'):
            if nm in bsdf.inputs:
                bsdf.inputs[nm].default_value = (*emit, 1.0)
                break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emit_strength
    if double:
        m.use_backface_culling = False
    else:
        m.use_backface_culling = True
    _mats[name] = m
    return m


TEX_UV = {}


def box_uv(o, scale):
    mw = o.matrix_world
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            w = mw @ l.vert.co
            if ax == 0:
                uv = (w.y, w.z)
            elif ax == 1:
                uv = (w.x, w.z)
            else:
                uv = (w.x, w.y)
            l[uvl].uv = (uv[0] * scale, uv[1] * scale)
    bm.to_mesh(o.data)
    bm.free()


def shade_by_angle(angle):
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def finish(o, mat, bevel=0.0, smooth=False, segs=2, angle=50):
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if mat.name in TEX_UV:
        box_uv(o, TEX_UV[mat.name])
    if bevel > 0:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        shade_by_angle(angle)
    o.select_set(False)
    return o


def box(size, loc, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, bevel, segs=1)


def cyl(r, depth, loc, mat, rot=(0, 0, 0), verts=12, r2=None, bevel=0.0, smooth=True, caps=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot,
                                            end_fill_type='NGON' if caps else 'NOTHING')
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, mat, bevel, smooth)


def ball(r, loc, mat, scale=(1, 1, 1), seg=8, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return finish(o, mat, smooth=True, angle=80)


def segment(p1, p2, thick, mat, bevel=0.0, thick2=None):
    a, b = Vector(p1), Vector(p2)
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    o = bpy.context.active_object
    o.scale = (thick, thick if thick2 is None else thick2, d.length)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, bevel)


def log(p1, p2, r, mat, verts=8):
    """Cilinder (boomstam) van p1 naar p2."""
    a, b = Vector(p1), Vector(p2)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, smooth=True, angle=60)


def mesh_object(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def loft(sections, mat, n=12, caps=(True, True), smooth=True, angle=50, vscale=1.0):
    """Buis door doorsneden (centrum, rx, ry) in het XY-vlak."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rings = []
    for s in sections:
        c = Vector(s[0])
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            ring.append(bm.verts.new(c + Vector((math.cos(a) * s[1], math.sin(a) * s[2], 0))))
        rings.append(ring)
    vacc = [0.0]
    for i in range(1, len(sections)):
        vacc.append(vacc[-1] + (Vector(sections[i][0]) - Vector(sections[i - 1][0])).length)
    for i in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            uvs = [(k / n, vacc[i]), ((k + 1) / n, vacc[i]), ((k + 1) / n, vacc[i + 1]), (k / n, vacc[i + 1])]
            for l, t in zip(f.loops, uvs):
                l[uvl].uv = (t[0], t[1] * vscale)
    if caps[0]:
        bm.faces.new(list(reversed(rings[0])))
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(bm, 'loft')
    return finish(o, mat, smooth=smooth, angle=angle)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.select_set(False)
    return o


def export(filename, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, filename)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='MATERIAL', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    tris = 0
    for o in objs:
        if o.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('Geexporteerd:', path, round(os.path.getsize(path) / 1024), 'KB', tris, 'tris')


def vcol_object(bm, cols, name, mat, angle=75):
    """bmesh + lijst vertexkleuren -> object met kleurattribuut 'Col'."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols):
        attr.data[i].color = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = attr
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return finish(o, mat, smooth=True, angle=angle)


def jitter_mesh(o, amount, seed):
    rnd = random.Random(seed)
    for v in o.data.vertices:
        v.co.x += rnd.uniform(-amount, amount)
        v.co.y += rnd.uniform(-amount, amount)
        v.co.z += rnd.uniform(-amount, amount) * 0.5


# ---------------------------------------------------------------- textures

def tile_noise(size, freqs, seed):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / size * 2 * math.pi
    f = np.zeros((size, size))
    for k in freqs:
        for _ in range(3):
            ax, ay = rng.integers(-k, k + 1, size=2)
            if ax == 0 and ay == 0:
                ax = k
            f += np.sin(ax * x + ay * y + rng.uniform(0, 6.28)) / k
    return (f - f.min()) / (f.max() - f.min())


def corrugated_texture():
    """Lichtgrijze golfplaat (wordt per container gekleurd): 9 golven per 2.6 m, roest + vuil onderaan."""
    s = 256
    y, x = np.mgrid[0:s, 0:s] / s
    wave = 0.80 + 0.20 * np.sin(x * 2 * math.pi * 9) ** 3
    n1 = tile_noise(s, [4, 7, 13], 5)
    streak = np.clip(tile_noise(s, [9, 17], 8) - 0.55, 0, 1) * (1 - y) * 0.8
    grime = np.clip(0.25 - y, 0, 1) * 1.3
    v = wave * (0.9 + 0.12 * n1) - streak * 0.25 - grime * 0.35 + np.random.rand(s, s) * 0.04
    img = np.repeat(v[:, :, None], 3, axis=2)
    rust = np.clip(tile_noise(s, [6, 11, 19], 21) - 0.7, 0, 1)[:, :, None] * 2.2
    img = img * (1 - rust) + np.array([0.42, 0.22, 0.12])[None, None, :] * rust
    return make_image('corrugated', img)


def metal_scuff_texture(name, seed, base=0.85):
    s = 128
    n = tile_noise(s, [5, 9, 15], seed)
    v = base + 0.12 * n - np.clip(tile_noise(s, [11, 19], seed + 1) - 0.72, 0, 1) * 1.2 + np.random.rand(s, s) * 0.05
    return make_image(name, np.repeat(v[:, :, None], 3, axis=2))


def concrete_texture():
    s = 128
    n = tile_noise(s, [3, 6, 11, 17], 31)
    v = 0.52 + 0.12 * n + np.random.rand(s, s) * 0.06
    img = np.array([1.0, 0.98, 0.94])[None, None, :] * v[:, :, None]
    return make_image('concrete', img)


def log_texture():
    s = 128
    y, x = np.mgrid[0:s, 0:s] / s
    fine = np.repeat(np.random.rand(1, s), s, axis=0)
    v = 0.8 + 0.12 * np.sin(x * 40 + np.sin(y * 9) * 2) * 0.5 + (fine - 0.5) * 0.18 + np.random.rand(s, s) * 0.06
    img = np.array([0.42, 0.29, 0.18])[None, None, :] * v[:, :, None]
    return make_image('logwood', img)


def burnt_texture():
    s = 128
    n1 = tile_noise(s, [4, 8, 14], 41)
    n2 = tile_noise(s, [6, 12, 21], 43)
    base = np.array([0.10, 0.09, 0.085])
    rust = np.array([0.38, 0.18, 0.08])
    paint = np.array([0.32, 0.33, 0.30])
    img = np.tile(base, (s, s, 1))
    m1 = np.clip((n1 - 0.45) * 3, 0, 1)[:, :, None]
    img = img * (1 - m1) + rust * m1
    m2 = np.clip((n2 - 0.72) * 4, 0, 1)[:, :, None]
    img = img * (1 - m2) + paint * m2
    return make_image('burnt', img * (0.9 + np.random.rand(s, s, 1) * 0.15))


M = {
    'cpaint': material('ContainerPaint', (1, 1, 1), 0.7, 0.15, image=corrugated_texture()),
    'cframe': material('ContainerFrame', (0.13, 0.12, 0.11), 0.7, 0.3),
    'steel': material('Steel', (0.35, 0.35, 0.36), 0.45, 0.8),
    'bpaint': material('BarrelPaint', (1, 1, 1), 0.55, 0.2, image=metal_scuff_texture('barrelscuff', 3)),
    'concrete': material('Concrete', (1, 1, 1), 0.95, image=concrete_texture()),
    'stripe': material('HazardStripe', (0.75, 0.55, 0.06), 0.7),
    'pole': material('PolePaint', (0.20, 0.22, 0.23), 0.55, 0.6),
    'glow': material('LampGlow', (1.0, 0.85, 0.6), 0.4, emit=(1.0, 0.72, 0.38), emit_strength=6.0),
    'redglow': material('RedGlow', (0.8, 0.05, 0.03), 0.4, emit=(1.0, 0.06, 0.03), emit_strength=8.0),
    'window': material('WindowGlow', (0.9, 0.7, 0.4), 0.3, emit=(1.0, 0.62, 0.30), emit_strength=2.2),
    'cabinwin': material('CabinWindow', (0.25, 0.17, 0.08), 0.3, emit=(1.0, 0.55, 0.22), emit_strength=0.55),
    'crane': material('CranePaint', (0.80, 0.55, 0.06), 0.55, 0.35),
    'craneDark': material('CraneDark', (0.12, 0.12, 0.12), 0.6, 0.5),
    'logs': material('LogWood', (1, 1, 1), 0.9, image=log_texture()),
    'logend': material('LogEnd', (0.62, 0.48, 0.32), 0.9),
    'plank': material('Planks', (0.15, 0.10, 0.065), 0.9),
    'snow': material('Snow', (0.86, 0.90, 0.96), 0.75),
    'stone': material('Stone', (0.34, 0.33, 0.32), 0.95),
    'roofwood': material('RoofWood', (0.20, 0.15, 0.11), 0.9),
    'bark': material('Bark', (0.30, 0.22, 0.15), 0.95),
    'needles': material('Needles', (1, 1, 1), 0.9, vcol=True),
    'palmtrunk': material('PalmTrunk', (0.45, 0.36, 0.25), 0.95),
    'frond': material('Frond', (1, 1, 1), 0.85, vcol=True, double=True),
    'brick': material('RubbleBrick', (0.26, 0.11, 0.07), 0.95),
    'plaster': material('RubblePlaster', (0.22, 0.20, 0.17), 0.95),
    'rstone': material('RubbleStone', (0.15, 0.14, 0.13), 0.95),
    'beam': material('Beam', (0.22, 0.16, 0.11), 0.9),
    'burnt': material('BurntMetal', (1, 1, 1), 0.8, 0.4, image=burnt_texture()),
    'tire': material('Tire', (0.04, 0.04, 0.04), 0.95),
    'hull': material('Hull', (0.17, 0.20, 0.26), 0.7, 0.3),
    'hullred': material('HullRed', (0.35, 0.07, 0.05), 0.8),
    'deck': material('Deck', (0.75, 0.75, 0.72), 0.7),
    'shipbox': material('ShipBoxes', (1, 1, 1), 0.7, vcol=True),
    'shrub': material('Shrub', (1, 1, 1), 0.95, vcol=True, double=True),
}
TEX_UV.update({'ContainerPaint': 1 / 2.6, 'BarrelPaint': 1.0, 'Concrete': 0.6, 'BurntMetal': 0.7})


# ---------------------------------------------------------------- container

def build_container():
    reset_scene()
    L, W, H = 6.06, 2.44, 2.59
    f = 0.14
    body = [box((L - 0.06, W - 0.08, H - 0.10), (0, 0, H / 2), M['cpaint'])]
    # deuren aan de +X kant: iets naar voren met een middennaad (zelfde verf)
    body.append(box((0.04, W - 0.3, H - 0.32), (L / 2 - 0.02, 0, H / 2), M['cpaint']))
    frame = []
    for x in (-1, 1):
        for y in (-1, 1):
            frame.append(box((f, f, H), (x * (L / 2 - f / 2), y * (W / 2 - f / 2), H / 2), M['cframe']))
    for z in (f / 2, H - f / 2):
        for y in (-1, 1):
            frame.append(box((L, f * 0.9, f), (0, y * (W / 2 - f * 0.45), z), M['cframe']))
        for x in (-1, 1):
            frame.append(box((f * 0.9, W, f), (x * (L / 2 - f * 0.45), 0, z), M['cframe']))
    # hoekstukken (corner castings)
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (0.09, H - 0.09):
                frame.append(box((0.2, 0.2, 0.18), (x * (L / 2 - 0.1), y * (W / 2 - 0.1), z), M['cframe']))
    metal = []
    # deurstangen + hendels
    for y in (-0.85, -0.35, 0.35, 0.85):
        metal.append(cyl(0.025, H - 0.3, (L / 2 + 0.03, y, H / 2), M['steel'], verts=6))
        metal.append(box((0.05, 0.05, 0.32), (L / 2 + 0.06, y + 0.08, 1.2), M['steel']))
    frame.append(box((0.03, 0.03, H - 0.32), (L / 2 + 0.005, 0, H / 2), M['cframe']))
    # naambord / opschrift (donkere blokjes) op beide lange zijden
    for y in (-1, 1):
        frame.append(box((1.6, 0.02, 0.32), (-1.2, y * (W / 2 - 0.035), H - 0.55), M['cframe']))
        frame.append(box((0.5, 0.02, 0.12), (1.6, y * (W / 2 - 0.035), H - 0.45), M['cframe']))
    export('container.glb', [join(body, 'body'), join(frame, 'frame'), join(metal, 'bars')])


def build_barrel():
    reset_scene()
    r, h = 0.29, 0.9
    o = [cyl(r, h - 0.02, (0, 0, h / 2), M['bpaint'], verts=16)]
    for z in (0.02, h * 0.33, h * 0.66, h - 0.02):
        o.append(cyl(r + 0.012, 0.035, (0, 0, z), M['bpaint'], verts=16))
    o.append(cyl(0.05, 0.02, (0.14, 0.06, h + 0.005), M['bpaint'], verts=8))
    export('barrel.glb', [join(o, 'barrel')])


def extrude_profile(profile, length, mat):
    """Profiel in het YZ-vlak (lijst (y, z)) langs X geextrudeerd, gesloten."""
    bm = bmesh.new()
    a = [bm.verts.new((-length / 2, y, z)) for (y, z) in profile]
    b = [bm.verts.new((length / 2, y, z)) for (y, z) in profile]
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(bm, 'extr')
    return finish(o, mat)


def build_jersey():
    reset_scene()
    prof = [(-0.30, 0), (0.30, 0), (0.30, 0.08), (0.19, 0.27), (0.08, 0.82), (-0.08, 0.82), (-0.19, 0.27), (-0.30, 0.08)]
    o = [extrude_profile(prof, 1.98, M['concrete'])]
    s = [box((0.02, 0.62, 0.06), (x, 0, 0.12), M['stripe']) for x in (-0.6, 0.6)]
    export('jersey.glb', [join(o, 'jersey'), join(s, 'stripes')])


def build_lamp():
    reset_scene()
    p = [cyl(0.2, 0.1, (0, 0, 0.05), M['pole'], verts=8),
         cyl(0.11, 7.3, (0, 0, 3.7), M['pole'], r2=0.065, verts=10),
         segment((0, 0, 7.15), (1.25, 0, 7.4), 0.08, M['pole']),
         box((0.7, 0.32, 0.14), (1.35, 0, 7.36), M['pole'])]
    g = [box((0.6, 0.24, 0.03), (1.35, 0, 7.28), M['glow'])]
    export('lamp.glb', [join(p, 'pole'), join(g, 'glow')])


def build_crane():
    reset_scene()
    o, d = [], []
    H = 16.0
    for x in (-7, 7):
        for y in (-5, 5):
            o.append(box((0.8, 0.8, H), (x, y, H / 2 + 0.4), M['crane']))
            d.append(box((0.9, 1.5, 0.7), (x, y, 0.35), M['craneDark']))          # wielstel
            d.append(cyl(0.3, 0.3, (x, y - 0.5, 0.3), M['tire'], rot=(0, math.pi / 2, 0), verts=10))
            d.append(cyl(0.3, 0.3, (x, y + 0.5, 0.3), M['tire'], rot=(0, math.pi / 2, 0), verts=10))
        # zijbalk tussen de poten (bovenaan) + schoren
        o.append(box((0.7, 10.8, 1.0), (x, 0, H - 2.2), M['crane']))
        o.append(segment((x, -5, H - 2.8), (x, 0, H - 7.0), 0.35, M['crane']))
        o.append(segment((x, 5, H - 2.8), (x, 0, H - 7.0), 0.35, M['crane']))
    # hoofdliggers langs X
    for y in (-5, 5):
        o.append(box((16.5, 0.9, 1.4), (0, y, H + 0.3), M['crane']))
    for x in (-7.5, 0, 7.5):
        o.append(box((0.6, 10.8, 0.5), (x, 0, H + 0.9), M['crane']))
    # loopkat met cabine
    o.append(box((3.2, 11.2, 1.2), (1.5, 0, H + 1.4), M['crane']))
    d.append(box((2.0, 1.8, 1.8), (1.5, -5.6, H - 1.0), M['craneDark']))
    w = [box((2.02, 0.05, 0.8), (1.5, -6.52, H - 0.8), M['window']),
         box((0.05, 1.5, 0.8), (2.52, -5.6, H - 0.8), M['window'])]
    # kabels + spreader
    for x in (0.9, 2.1):
        d.append(cyl(0.03, 6.5, (x, 0, H - 2.4), M['steel'], verts=4))
    d.append(box((6.0, 2.3, 0.35), (1.5, 0, H - 5.8), M['craneDark']))
    # ladder aan een poot
    for i in range(24):
        d.append(box((0.5, 0.04, 0.04), (-7, -5.5, 1.0 + i * 0.6), M['steel']))
    r = [box((0.3, 0.3, 0.3), (x, y, H + 1.15), M['redglow']) for x in (-8.0, 8.0) for y in (-5, 5)]
    export('crane.glb', [join(o, 'crane'), join(d, 'dark'), join(w, 'windows'), join(r, 'redlights')])


# (de blokhut staat nu in tools/build_buildings.py: hol, met deur, ramen en meubels)


# ---------------------------------------------------------------- besneeuwde den

NEEDLE = (0.050, 0.095, 0.050)
SNOW = (0.80, 0.86, 0.93)


def pine_tier_snow(bm, cols, z, h, r, nb, rnd, bright, snowy, tipdroop=1.0):
    """Takkenkrans zoals de bos-den, maar de bovenkant van de takken is wit (sneeuw)."""
    k0 = bright * rnd.uniform(0.88, 1.1)

    def green(f):
        return (NEEDLE[0] * f, NEEDLE[1] * f, NEEDLE[2] * f)

    def snow(f):
        return (SNOW[0] * f, SNOW[1] * f, SNOW[2] * f)

    def vert(p, c):
        cols.append(c)
        return bm.verts.new(p)

    rot = rnd.uniform(0, 2 * math.pi)
    cx, cy = rnd.uniform(-0.07, 0.07), rnd.uniform(-0.07, 0.07)
    top = vert((cx, cy, z + h), snow(1.0) if snowy > 0.3 else green(k0))
    inner, outer = [], []
    for k in range(2 * nb):
        ang = rot + k * math.pi / nb + rnd.uniform(-0.14, 0.14)
        ca, sa = math.cos(ang), math.sin(ang)
        if k % 2 == 0:
            L = rnd.uniform(0.74, 1.14)
            ro, zo = r * L, z - r * rnd.uniform(0.12, 0.26) * L * tipdroop
            ri, zi = r * 0.5 * L, z + h * rnd.uniform(0.36, 0.46)
            ci = snow(rnd.uniform(0.92, 1.05)) if rnd.random() < snowy else green(k0 * 1.2)
            co = green(k0 * 1.3) if rnd.random() > snowy * 0.6 else snow(0.85)
        else:
            ro, zo = r * rnd.uniform(0.46, 0.6), z + h * 0.14
            ri, zi = r * 0.30, z + h * 0.52
            co, ci = green(k0 * 0.55), green(k0 * 0.8)
        inner.append(vert((cx * 0.5 + ca * ri, cy * 0.5 + sa * ri, zi), ci))
        outer.append(vert((ca * ro, sa * ro, zo), co))
    under = vert((cx * 0.3, cy * 0.3, z + h * 0.1), green(k0 * 0.3))
    m = len(inner)
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((top, inner[k], inner[k2]))
        bm.faces.new((inner[k], outer[k], outer[k2], inner[k2]))
        bm.faces.new((outer[k2], outer[k], under))


def build_snowpine():
    reset_scene()
    rnd = random.Random(4321)
    trunk = loft([((0, 0, -0.1), 0.36, 0.34), ((0, 0, 0.2), 0.27, 0.26), ((0.01, 0, 1.0), 0.22, 0.22),
                  ((0.0, 0.02, 5.0), 0.13, 0.13), ((0, 0, 9.4), 0.03, 0.03)], M['bark'], n=7, caps=(False, True), angle=70)
    trunk.name = trunk.data.name = 'trunk'
    bm = bmesh.new()
    cols = []
    n = 13
    for i in range(n):
        t = i / (n - 1)
        r = 2.3 * (1 - t) ** 1.05 + 0.3
        z = 1.5 + (t ** 0.97) * 7.3
        pine_tier_snow(bm, cols, z, 1.5 - t * 0.65, r, int(round(10 - 4 * t)), rnd, 0.8 + 0.3 * t, 0.75)
    pine_tier_snow(bm, cols, 9.0, 0.7, 0.26, 5, rnd, 1.1, 0.9, 0.6)
    foliage = vcol_object(bm, cols, 'foliage', M['needles'])
    export('snowpine.glb', [trunk, foliage])


# ---------------------------------------------------------------- palm

def build_palm():
    reset_scene()
    rnd = random.Random(77)
    secs = []
    H = 8.0
    for i in range(15):
        t = i / 14
        x = 0.9 * t * t
        r = 0.24 - 0.08 * t + (0.025 if i % 2 else 0)
        secs.append(((x, 0, t * H), r, r))
    trunk = loft(secs, M['palmtrunk'], n=8, caps=(False, True), angle=60)
    top = Vector((0.9, 0, H))
    bm = bmesh.new()
    cols = []
    nf = 10
    for f in range(nf):
        ang = f * 2 * math.pi / nf + rnd.uniform(-0.15, 0.15)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-d.y, d.x, 0))
        length = rnd.uniform(3.2, 4.2)
        lift = rnd.uniform(0.35, 0.8)
        segs = 7
        prev = None
        for s in range(segs + 1):
            t = s / segs
            p = top + d * (length * t) + Vector((0, 0, lift * math.sin(t * math.pi * 0.8) * 1.4 - 2.2 * t * t))
            w = 0.55 * math.sin(math.pi * min(1, t * 1.1 + 0.05)) + 0.05
            g = 0.75 + 0.35 * t
            cA = (0.10 * g, 0.20 * g, 0.05 * g)
            cB = (0.16 * g, 0.24 * g, 0.07 * g)
            a = bm.verts.new(p - side * w + Vector((0, 0, -0.12 * w)))
            m = bm.verts.new(p + Vector((0, 0, 0.05)))
            b = bm.verts.new(p + side * w + Vector((0, 0, -0.12 * w)))
            cols += [cA, cB, cA]
            if prev:
                bm.faces.new((prev[0], prev[1], m, a))
                bm.faces.new((prev[1], prev[2], b, m))
            prev = (a, m, b)
    fronds = vcol_object(bm, cols, 'fronds', M['frond'], angle=80)
    nuts = [ball(0.13, top + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, -0.25)), M['beam']) for a in (0.3, 2.4, 4.4)]
    export('palm.glb', [join([trunk] + nuts, 'trunk'), fronds])


# ---------------------------------------------------------------- puin, auto, houtstapel

def build_rubble():
    reset_scene()
    rnd = random.Random(5)
    parts = {'brick': [], 'plaster': [], 'rstone': []}
    for i in range(46):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0, 1.0) ** 0.7 * 1.3
        x, y = math.cos(a) * d, math.sin(a) * d * 0.8
        zmax = 0.75 * (1 - (d / 1.35) ** 2)
        z = rnd.uniform(0, max(0.05, zmax))
        kind = rnd.choice(['brick', 'brick', 'plaster', 'rstone'])
        if kind == 'brick':
            sz = (0.24, 0.12, 0.08)
            if rnd.random() < 0.4:
                sz = (rnd.uniform(0.4, 0.7), rnd.uniform(0.25, 0.4), rnd.uniform(0.12, 0.2))   # brokken metselwerk
        else:
            sz = (rnd.uniform(0.2, 0.6), rnd.uniform(0.2, 0.5), rnd.uniform(0.08, 0.25))
        o = box(sz, (x, y, z + sz[2] / 2), M[kind], rot=(rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(0, 3.14)))
        parts[kind].append(o)
    # heuvel eronder zodat het een hoop is
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=1.0, location=(0, 0, -0.2))
    mound = bpy.context.active_object
    mound.scale = (1.45, 1.15, 0.6)
    jitter_mesh(mound, 0.08, 3)
    parts['rstone'].append(finish(mound, M['rstone']))
    beams = [box((2.2, 0.16, 0.16), (0.2, 0.1, 0.45), M['beam'], rot=(0.1, -0.3, 0.6)),
             box((1.4, 0.14, 0.14), (-0.5, -0.4, 0.3), M['beam'], rot=(0.0, 0.25, -0.9))]
    objs = [join(v, k) for k, v in parts.items() if v] + [join(beams, 'beams')]
    export('rubble.glb', objs)


def build_car():
    reset_scene()
    b = []
    # onderbak: afgeschuinde doos
    prof = [(-0.92, 0.32), (0.92, 0.32), (0.92, 0.95), (0.85, 1.05), (-0.85, 1.05), (-0.92, 0.95)]
    body = extrude_profile(prof, 4.2, M['burnt'])
    b.append(body)
    # cabine (taps)
    bm = bmesh.new()
    lo = [(-1.1, -0.82), (1.0, -0.82), (1.0, 0.82), (-1.1, 0.82)]
    hi = [(-0.6, -0.68), (0.35, -0.68), (0.35, 0.68), (-0.6, 0.68)]
    vl = [bm.verts.new((x, y, 1.05)) for x, y in lo]
    vh = [bm.verts.new((x, y, 1.45)) for x, y in hi]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vl[i], vl[j], vh[j], vh[i]))
    bm.faces.new(vh)
    bm.faces.new(list(reversed(vl)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cab = mesh_object(bm, 'cab')
    b.append(finish(cab, M['burnt']))
    # lege ramen (donker)
    dark = [box((1.2, 1.5, 0.3), (-0.15, 0, 1.24), M['tire'])]
    for x in (-1.35, 1.35):
        for y in (-0.82, 0.82):
            dark.append(cyl(0.34, 0.24, (x, y, 0.32), M['tire'], rot=(math.pi / 2, 0, 0), verts=12))
            b.append(cyl(0.2, 0.26, (x, y, 0.32), M['burnt'], rot=(math.pi / 2, 0, 0), verts=8))
    export('car.glb', [join(b, 'car'), join(dark, 'dark')])


def build_logs():
    reset_scene()
    rnd = random.Random(9)
    lg, ends, sn = [], [], []
    r = 0.19
    rows = [(5, 0.0), (4, 1), (3, 2), (2, 3)]
    for n, k in rows:
        z = r + k * r * 1.72
        for i in range(n):
            y = (i - (n - 1) / 2) * 2 * r * 1.02
            x0, x1 = -1.45 + rnd.uniform(-0.08, 0.08), 1.45 + rnd.uniform(-0.08, 0.08)
            lg.append(log((x0, y, z), (x1, y, z), r * rnd.uniform(0.9, 1.05), M['logs']))
            for xe in (x0, x1):
                ends.append(cyl(r * 0.92, 0.02, (xe + (0.005 if xe > 0 else -0.005), y, z), M['logend'], rot=(0, math.pi / 2, 0), verts=8))
    sn.append(box((2.9, 0.5, 0.1), (0, 0, 3 * r * 1.72 + 2 * r - 0.04), M['snow'], 0.04))
    sn.append(box((2.9, 0.25, 0.08), (0, -0.55, 2 * r * 1.72 + 1.6 * r), M['snow'], 0.03, rot=(0.6, 0, 0)))
    sn.append(box((2.9, 0.25, 0.08), (0, 0.55, 2 * r * 1.72 + 1.6 * r), M['snow'], 0.03, rot=(-0.6, 0, 0)))
    # paaltjes aan de uiteinden
    for x in (-1.25, 1.25):
        for y in (-0.62, 0.62):
            lg.append(box((0.1, 0.1, 1.05), (x, y, 0.52), M['plank']))
    export('logs.glb', [join(lg, 'logs'), join(ends, 'ends'), join(sn, 'snow')])


def build_ship():
    reset_scene()
    L, B = 150.0, 22.0
    # romp (taps voor- en achterkant)
    bm = bmesh.new()
    prof = []
    for i in range(13):
        t = i / 12
        x = -L / 2 + t * L
        w = B / 2 * (1 - max(0, (t - 0.8) / 0.2) ** 1.6 * 0.95) * (1 - max(0, (0.06 - t) / 0.06) * 0.3)
        prof.append((x, w))
    top = [bm.verts.new((x, -w, 12)) for x, w in prof] + [bm.verts.new((x, w, 12)) for x, w in reversed(prof)]
    bot = [bm.verts.new((x, -w * 0.85, -6)) for x, w in prof] + [bm.verts.new((x, w * 0.85, -6)) for x, w in reversed(prof)]
    n = len(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    hull = finish(mesh_object(bm, 'hull'), M['hull'])
    red = [box((L * 0.97, B * 0.86, 1.2), (0, 0, 0.6), M['hullred'])]
    # brug achteraan
    sup = [box((14, 18, 14), (-L / 2 + 14, 0, 19), M['deck']), box((10, 24, 2.5), (-L / 2 + 14, 0, 27.2), M['deck']),
           box((2, 2, 8), (-L / 2 + 8, 0, 31), M['hullred'])]
    win = []
    for z in (15, 18.5, 22, 25.5):
        win.append(box((0.2, 16, 0.9), (-L / 2 + 21.05, 0, z), M['window']))
    win.append(box((0.2, 22, 1.2), (-L / 2 + 19.1, 0, 27.4), M['window']))
    lights = [box((0.6, 0.6, 0.6), (x, 0, 13.0), M['glow']) for x in (-40, 0, 40, 70)]
    lights.append(box((0.8, 0.8, 0.8), (-L / 2 + 8, 0, 35.3), M['redglow']))
    # containers op het dek (vertexkleuren)
    cb = bmesh.new()
    cols = []
    rnd = random.Random(12)
    palette = [(0.45, 0.08, 0.05), (0.06, 0.18, 0.40), (0.10, 0.30, 0.15), (0.55, 0.30, 0.06), (0.5, 0.5, 0.5), (0.25, 0.07, 0.25)]
    for bx in range(10):
        x0 = -L / 2 + 28 + bx * 10.5
        h = rnd.randint(2, 5)
        for by in range(7):
            y0 = -B / 2 + 1.6 + by * 2.7
            hh = max(1, h + rnd.randint(-1, 1))
            for k in range(hh):
                c = rnd.choice(palette)
                cc = (c[0] * rnd.uniform(0.85, 1.1), c[1] * rnd.uniform(0.85, 1.1), c[2] * rnd.uniform(0.85, 1.1))
                ret = bmesh.ops.create_cube(cb, size=1.0)
                for v in ret['verts']:
                    v.co = Vector((x0 + v.co.x * 10.0, y0 + v.co.y * 2.6, 12 + 1.3 + k * 2.65 + v.co.z * 2.6))
                cols += [cc] * len(ret['verts'])
    boxes = vcol_object(cb, cols, 'deckboxes', M['shipbox'], angle=20)
    export('ship.glb', [hull, join(red, 'boot'), join(sup, 'bridge'), join(win, 'windows'), join(lights, 'lights'), boxes])


def build_shrub():
    reset_scene()
    rnd = random.Random(3)
    bm = bmesh.new()
    cols = []
    for i in range(22):
        a = rnd.uniform(0, 2 * math.pi)
        tilt = rnd.uniform(0.3, 1.1)
        L = rnd.uniform(0.5, 1.0)
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        side = Vector((-math.sin(a), math.cos(a), 0)) * 0.12
        base = Vector((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), 0))
        tip = base + d * L
        v = [bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(tip)]
        bm.faces.new(v)
        g = rnd.uniform(0.7, 1.1)
        cols += [(0.12 * g, 0.10 * g, 0.05 * g), (0.12 * g, 0.10 * g, 0.05 * g), (0.36 * g, 0.32 * g, 0.16 * g)]
    o = vcol_object(bm, cols, 'shrub', M['shrub'], angle=10)
    export('shrub.glb', [o])


build_container()
build_barrel()
build_jersey()
build_lamp()
build_crane()
build_snowpine()
build_palm()
build_rubble()
build_car()
build_logs()
build_ship()
build_shrub()
print('KLAAR')
