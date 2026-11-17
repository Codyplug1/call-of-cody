"""
Bouwt de modellen voor betreedbare gebouwen en exporteert ze als .glb (fase "deuren").

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/build_buildings.py

Assen: Blender-X = game-X, Blender-Y = game -Z, Blender-Z = game-Y (omhoog). Oorsprong = midden onderkant.

Contract met public/shared.js (CABIN, PROP_DIMS) en public/doors.js:
  cabin.glb      : holle blokhut 6.0 x 4.6 (buitenkant), wanden 0.26 dik, dakrand 2.5 m, nok 4.3 m.
                   Deur in de voorgevel (game +z = Blender -Y) op x = -1.25 (1.4 x 2.1), ramen 1.2 x 0.95
                   (borstwering 1.0 m): voorgevel x = 0.9, rechterwand (+x) game z = -0.2, linkerwand game z = +0.2.
                   Plankenvloer 4 cm boven de grond, kachelpijp boven de kachel op game (-2.4, -1.66).
  door.glb       : houten deurblad 1.0 breed x 2.0 hoog x 0.06, scharnier op de oorsprong, blad loopt langs +X.
                   Materiaal 'DoorWood' (per deur getint), 'Iron' (beslag).
  door_metal.glb : stalen deur, zelfde maten. Materiaal 'DoorMetal', 'Iron'.
  table.glb      : tafel 1.2 x 0.8, 0.8 hoog.      shelf.glb : kast 1.2 x 0.44, 1.9 hoog.
  bunk.glb       : stapelbed 2.0 x 0.9, 1.6 hoog.   stove.glb : houtkachel 0.6 x 0.6, 0.85 hoog.
  pew.glb        : kerkbank 3.0 x 0.6, 0.9 hoog.    lantern.glb : lantaarn 0.16 x 0.3, materiaal 'LanternGlow' gloeit.
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
random.seed(21)
np.random.seed(21)


# ---------------------------------------------------------------- basis (zoals build_levels.py)

def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def make_image(name, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


_mats = {}


def material(name, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0, image=None, emit=None, emit_strength=1.0):
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
    if emit is not None:
        for nm in ('Emission Color', 'Emission'):
            if nm in bsdf.inputs:
                bsdf.inputs[nm].default_value = (*emit, 1.0)
                break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emit_strength
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
            uv = (w.y, w.z) if ax == 0 else (w.x, w.z) if ax == 1 else (w.x, w.y)
            l[uvl].uv = (uv[0] * scale, uv[1] * scale)
    bm.to_mesh(o.data)
    bm.free()


def shade_by_angle(angle):
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def finish(o, mat, bevel=0.0, smooth=False, segs=1, angle=50):
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
    return finish(o, mat, bevel)


def box2(x0, x1, y0, y1, z0, z1, mat, bevel=0.0):
    """Doos tussen twee hoekpunten (handig voor kozijnen en meubels)."""
    return box((x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, bevel)


def cyl(r, depth, loc, mat, rot=(0, 0, 0), verts=12, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, mat, smooth=smooth)


def log(p1, p2, r, mat, verts=9):
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
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')
    print('Geexporteerd:', path, round(os.path.getsize(path) / 1024), 'KB', tris, 'tris')


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


def log_texture():
    s = 128
    y, x = np.mgrid[0:s, 0:s] / s
    fine = np.repeat(np.random.rand(1, s), s, axis=0)
    v = 0.8 + 0.12 * np.sin(x * 40 + np.sin(y * 9) * 2) * 0.5 + (fine - 0.5) * 0.18 + np.random.rand(s, s) * 0.06
    return make_image('logwood', np.array([0.42, 0.29, 0.18])[None, None, :] * v[:, :, None])


def plank_texture(name, base, boards=4, seed=3):
    """Planken (naad elke 1/boards), houtnerf, iets verschillende tint per plank."""
    s = 256
    y, x = np.mgrid[0:s, 0:s] / s
    rng = np.random.default_rng(seed)
    idx = np.floor(x * boards).astype(int)
    tint = rng.uniform(0.82, 1.12, size=boards + 1)[idx]
    grain = 0.88 + 0.12 * np.sin(x * 2 * math.pi * 60 + np.sin(y * 2 * math.pi * 2 + idx * 1.7) * 2.5) * (0.6 + 0.4 * tile_noise(s, [3, 7], seed))
    seam = np.clip(np.abs((x * boards) % 1 - 0.5) * 2 - 0.92, 0, 1) * 6
    v = tint * grain * (1 - seam * 0.6) + np.random.rand(s, s) * 0.05
    return make_image(name, np.array(base)[None, None, :] * v[:, :, None])


def stone_texture():
    s = 128
    n = tile_noise(s, [3, 7, 13], 17)
    v = 0.75 + 0.3 * n + np.random.rand(s, s) * 0.08
    return make_image('cabinstone', np.array([0.36, 0.35, 0.34])[None, None, :] * v[:, :, None])


def metal_texture():
    s = 128
    n = tile_noise(s, [5, 9, 15], 4)
    v = 0.85 + 0.12 * n - np.clip(tile_noise(s, [11, 19], 5) - 0.75, 0, 1) * 1.1 + np.random.rand(s, s) * 0.04
    return make_image('doormetal', np.array([0.36, 0.42, 0.38])[None, None, :] * v[:, :, None])


M = {
    'logs': material('LogWood', (1, 1, 1), 0.9, image=log_texture()),
    'logend': material('LogEnd', (0.62, 0.48, 0.32), 0.9),
    'floor': material('FloorPlanks', (1, 1, 1), 0.85, image=plank_texture('floorplanks', (0.40, 0.28, 0.17), 5, 7)),
    'trim': material('Trim', (0.24, 0.17, 0.11), 0.85),
    'roofwood': material('RoofWood', (0.20, 0.15, 0.11), 0.9),
    'rafter': material('Rafter', (0.30, 0.21, 0.13), 0.9),
    'snow': material('Snow', (0.86, 0.90, 0.96), 0.75),
    'stone': material('Stone', (1, 1, 1), 0.95, image=stone_texture()),
    'iron': material('Iron', (0.10, 0.10, 0.10), 0.5, 0.8),
    'doorwood': material('DoorWood', (1, 1, 1), 0.85, image=plank_texture('doorplanks', (0.46, 0.31, 0.18), 5, 11)),
    'doormetal': material('DoorMetal', (1, 1, 1), 0.55, 0.5, image=metal_texture()),
    'furn': material('Furniture', (1, 1, 1), 0.8, image=plank_texture('furnplanks', (0.50, 0.36, 0.22), 3, 13)),
    'darkwood': material('DarkWood', (0.22, 0.15, 0.09), 0.85),
    'cloth': material('Blanket', (0.42, 0.13, 0.10), 0.95),
    'cloth2': material('Mattress', (0.62, 0.58, 0.48), 0.95),
    'stoveiron': material('StoveIron', (0.13, 0.13, 0.13), 0.6, 0.7),
    'fire': material('Fire', (1.0, 0.45, 0.1), 0.6, emit=(1.0, 0.42, 0.10), emit_strength=4.0),
    'glow': material('LanternGlow', (1.0, 0.85, 0.55), 0.4, emit=(1.0, 0.70, 0.35), emit_strength=6.0),
    'jar': material('Jars', (0.55, 0.45, 0.30), 0.6),
    'can': material('Cans', (0.35, 0.40, 0.30), 0.5, 0.5),
}
TEX_UV.update({'FloorPlanks': 0.5, 'DoorWood': 1.0, 'Furniture': 0.9, 'Stone': 1.2, 'DoorMetal': 0.8})


# ---------------------------------------------------------------- blokhut (hol)

HX, HZ, T = 3.0, 2.3, 0.26
EAVE, RIDGE, ROOF_EDGE, ROOF_EAVE_Y = 2.5, 4.3, 2.75, 2.55
DOOR = (-1.25, 1.4, 2.1)          # x, breedte, hoogte
WIN_W, WIN_SILL, WIN_TOP = 1.2, 1.0, 1.95
FRONT_WIN_X = 0.9
RIGHT_WIN_GZ, LEFT_WIN_GZ = -0.2, 0.2   # game-z van de ramen in de zijwanden
STOVE = (-2.4, -1.66)            # game x, z


def openings():
    """Openingen per wand: (along0, along1, z0, z1) langs de lengte van die wand (Blender-coÃ¶rdinaten)."""
    fy = -(HZ - T / 2)   # voorgevel (game +z)
    return {
        'front': [(DOOR[0] - DOOR[1] / 2, DOOR[0] + DOOR[1] / 2, 0.0, DOOR[2]),
                  (FRONT_WIN_X - WIN_W / 2, FRONT_WIN_X + WIN_W / 2, WIN_SILL, WIN_TOP)],
        'back': [],
        # zijwanden lopen langs Blender-Y (= -game z)
        'right': [(-RIGHT_WIN_GZ - WIN_W / 2, -RIGHT_WIN_GZ + WIN_W / 2, WIN_SILL, WIN_TOP)],
        'left': [(-LEFT_WIN_GZ - WIN_W / 2, -LEFT_WIN_GZ + WIN_W / 2, WIN_SILL, WIN_TOP)],
    }, fy


def split_span(a0, a1, zc, r, ops):
    """Stuk [a0, a1] van een stam op hoogte zc, zonder de openingen die de stam raken."""
    cuts = sorted([(o[0], o[1]) for o in ops if zc + r * 0.6 > o[2] and zc - r * 0.6 < o[3]])
    out, s = [], a0
    for c0, c1 in cuts:
        if c0 > s + 0.05:
            out.append((s, c0))
        s = max(s, c1)
    if a1 > s + 0.05:
        out.append((s, a1))
    return out


def build_cabin():
    reset_scene()
    rl = T / 2
    ops, fy = openings()
    logs, ends, trim, floor, roof, snow, stone, rafters, det, fire = [], [], [], [], [], [], [], [], [], []
    step = 2 * rl * 0.92
    n = int(math.ceil((EAVE - 0.1) / step))
    for i in range(n):
        z = 0.08 + rl + i * step
        zs = z + step / 2          # zijwanden liggen een halve stam hoger (in elkaar gekeept)
        for name, y in (('front', fy), ('back', -fy)):
            for a, b in split_span(-HX - 0.22, HX + 0.22, z, rl, ops[name]):
                logs.append(log((a, y, z), (b, y, z), rl, M['logs']))
                for e in (a, b):
                    ends.append(cyl(rl * 0.9, 0.02, (e + (0.011 if e == b else -0.011), y, z), M['logend'], rot=(0, math.pi / 2, 0), verts=9))
        if zs + rl > EAVE + 0.1:
            continue
        for name, x in (('right', HX - rl), ('left', -(HX - rl))):
            for a, b in split_span(-HZ - 0.22, HZ + 0.22, zs, rl, ops[name]):
                logs.append(log((x, a, zs), (x, b, zs), rl, M['logs']))
                for e in (a, b):
                    ends.append(cyl(rl * 0.9, 0.02, (x, e + (0.011 if e == b else -0.011), zs), M['logend'], rot=(math.pi / 2, 0, 0), verts=9))
    # puntgevels: steeds kortere stammen
    k = (RIDGE - ROOF_EAVE_Y) / ROOF_EDGE
    z = EAVE + rl * 0.6
    while z < RIDGE - 0.25:
        half = (RIDGE - (z + rl)) / k - 0.05
        if half < 0.2:
            break
        for x in (HX - rl, -(HX - rl)):
            logs.append(log((x, -half, z), (x, half, z), rl, M['logs']))
        z += step
    # kozijnen rond deur en ramen (aan beide kanten van de muur iets uitstekend)
    def frame_front(a0, a1, z0, z1, y, sill):
        d = T + 0.08
        trim.append(box2(a0 - 0.09, a0, y - d / 2, y + d / 2, z0, z1 + 0.09, M['trim']))
        trim.append(box2(a1, a1 + 0.09, y - d / 2, y + d / 2, z0, z1 + 0.09, M['trim']))
        trim.append(box2(a0 - 0.09, a1 + 0.09, y - d / 2, y + d / 2, z1, z1 + 0.11, M['trim']))
        if sill:
            trim.append(box2(a0 - 0.12, a1 + 0.12, y - d / 2 - 0.06, y + d / 2 + 0.03, z0 - 0.07, z0, M['trim']))

    def frame_side(a0, a1, z0, z1, x):
        d = T + 0.08
        trim.append(box2(x - d / 2, x + d / 2, a0 - 0.09, a0, z0, z1 + 0.09, M['trim']))
        trim.append(box2(x - d / 2, x + d / 2, a1, a1 + 0.09, z0, z1 + 0.09, M['trim']))
        trim.append(box2(x - d / 2, x + d / 2, a0 - 0.09, a1 + 0.09, z1, z1 + 0.11, M['trim']))
        trim.append(box2(x - d / 2 - 0.05, x + d / 2 + 0.05, a0 - 0.12, a1 + 0.12, z0 - 0.07, z0, M['trim']))

    for o in ops['front']:
        frame_front(o[0], o[1], o[2], o[3], fy, o[2] > 0.1)
    for o in ops['right']:
        frame_side(o[0], o[1], o[2], o[3], HX - rl)
    for o in ops['left']:
        frame_side(o[0], o[1], o[2], o[3], -(HX - rl))
    # luiken naast de ramen (open, buitenkant)
    for o in ops['front']:
        if o[2] > 0.1:
            for a, sgn in ((o[0], -1), (o[1], 1)):
                det.append(box2(min(a, a + sgn * 0.62) + sgn * 0.1, max(a, a + sgn * 0.62) + sgn * 0.1, fy - T / 2 - 0.09, fy - T / 2 - 0.05, o[2], o[3], M['trim']))
    # plankenvloer binnen (4 cm boven de grond) en een stoepje voor de deur
    floor.append(box2(-HX + 0.08, HX - 0.08, -HZ + 0.08, HZ - 0.08, -0.12, 0.04, M['floor']))
    floor.append(box2(DOOR[0] - DOOR[1] / 2, DOOR[0] + DOOR[1] / 2, fy - T / 2, fy + T / 2, -0.12, 0.05, M['floor']))
    floor.append(box2(DOOR[0] - 0.95, DOOR[0] + 0.95, -HZ - 0.85, -HZ + 0.01, -0.25, 0.06, M['floor']))
    # stenen voet buiten (niet voor de deur)
    for (x0, x1, y0, y1) in ((-HX - 0.06, DOOR[0] - DOOR[1] / 2 - 0.1, -HZ - 0.06, -HZ + 0.12),
                             (DOOR[0] + DOOR[1] / 2 + 0.1, HX + 0.06, -HZ - 0.06, -HZ + 0.12),
                             (-HX - 0.06, HX + 0.06, HZ - 0.12, HZ + 0.06),
                             (-HX - 0.06, -HX + 0.12, -HZ, HZ), (HX - 0.12, HX + 0.06, -HZ, HZ)):
        stone.append(box2(x0, x1, y0, y1, -0.35, 0.1, M['stone'], 0.02))
    # dak: twee schuine platen + sneeuw, nokbalk, spanten binnen
    half = ROOF_EDGE
    rise = RIDGE - ROOF_EAVE_Y
    ang = math.atan2(rise, half)
    slab = math.hypot(half, rise) + 0.06
    for s in (-1, 1):
        cy = s * half / 2
        cz = RIDGE - rise / 2
        nrm = Vector((0, s * math.sin(ang), math.cos(ang)))
        roof.append(box((2 * HX + 0.8, slab, 0.14), Vector((0, cy, cz)) - nrm * 0.02, M['roofwood'], rot=(-s * ang, 0, 0)))
        snow.append(box((2 * HX + 0.7, slab - 0.12, 0.16), Vector((0, cy, cz)) + nrm * 0.13, M['snow'], 0.03, rot=(-s * ang, 0, 0)))
    rafters.append(box((2 * HX + 0.6, 0.18, 0.2), (0, 0, RIDGE - 0.2), M['rafter']))
    for x in (-1.5, 0.0, 1.5):
        for s in (-1, 1):
            p1 = Vector((x, s * (HZ - T), EAVE))
            p2 = Vector((x, 0, RIDGE - 0.25))
            d = p2 - p1
            bpy.ops.mesh.primitive_cube_add(size=1, location=(p1 + p2) / 2)
            o = bpy.context.active_object
            o.scale = (0.12, 0.12, d.length)
            o.rotation_mode = 'QUATERNION'
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
            rafters.append(finish(o, M['rafter']))
        rafters.append(box((0.12, 2 * (HZ - T), 0.14), (x, 0, EAVE + 0.05), M['rafter']))
    # schoorsteen boven de kachel + kachelpijp naar binnen
    sx, sy = STOVE[0], -STOVE[1]
    roof_z = RIDGE - k * abs(sy)
    stone.append(box2(sx - 0.3, sx + 0.3, sy - 0.3, sy + 0.3, roof_z - 0.2, RIDGE + 0.55, M['stone'], 0.02))
    snow.append(box2(sx - 0.33, sx + 0.33, sy - 0.33, sy + 0.33, RIDGE + 0.55, RIDGE + 0.66, M['snow'], 0.03))
    det.append(cyl(0.075, roof_z - 0.85, (sx, sy, 0.85 + (roof_z - 0.85) / 2), M['stoveiron'], verts=10))
    # wandplankje met potjes en een kleed op de vloer
    det.append(box2(-0.4, 0.6, HZ - T - 0.22, HZ - T, 1.55, 1.59, M['trim']))
    for i, x in enumerate((-0.3, -0.05, 0.25, 0.45)):
        det.append(cyl(0.05 + 0.01 * (i % 2), 0.14 + 0.04 * (i % 3), (x, HZ - T - 0.11, 1.66 + 0.02 * (i % 3)), M['jar'] if i % 2 else M['can'], verts=8))
    det.append(box2(-1.9, -0.5, -0.9, 0.6, 0.04, 0.055, M['cloth']))
    # sneeuwrand buiten langs de voet (niet voor de deur)
    for (x0, x1, y0, y1) in ((-HX - 0.3, DOOR[0] - 1.05, -HZ - 0.55, -HZ - 0.02), (DOOR[0] + 1.05, HX + 0.3, -HZ - 0.55, -HZ - 0.02),
                             (-HX - 0.3, HX + 0.3, HZ + 0.02, HZ + 0.55)):
        snow.append(box2(x0, x1, y0, y1, -0.1, 0.1, M['snow'], 0.08))
    export('cabin.glb', [join(logs, 'logs'), join(ends, 'ends'), join(trim + det, 'trim'), join(floor, 'floor'),
                         join(stone, 'stone'), join(roof + rafters, 'roof'), join(snow, 'snow')])


# ---------------------------------------------------------------- deuren (scharnier op de oorsprong, blad langs +X)

def build_door():
    reset_scene()
    W, H, D = 1.0, 2.0, 0.06
    wood, iron = [], []
    nb = 5
    for i in range(nb):
        x0 = W * i / nb + 0.004
        wood.append(box2(x0, x0 + W / nb - 0.008, -D / 2, D / 2, 0.0, H, M['doorwood'], 0.006))
    # klampen en schoor aan de binnenkant (+Y = game -z)
    for z in (0.35, 1.65):
        wood.append(box2(0.05, W - 0.05, D / 2, D / 2 + 0.035, z - 0.07, z + 0.07, M['doorwood'], 0.01))
    d = Vector((W - 0.2, 0, 1.65 - 0.35 - 0.1))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(W / 2, D / 2 + 0.017, 1.0))
    o = bpy.context.active_object
    o.scale = (d.length, 0.03, 0.12)
    o.rotation_euler = (0, -math.atan2(d.z, d.x), 0)
    wood.append(finish(o, M['doorwood']))
    # hengsels, klink aan beide kanten
    for z in (0.35, 1.65):
        iron.append(box2(-0.01, 0.42, -D / 2 - 0.012, -D / 2, z - 0.03, z + 0.03, M['iron']))
        iron.append(cyl(0.025, H * 0.0 + 0.12, (0.0, 0.0, z), M['iron'], verts=8))
    for y, s in ((-D / 2 - 0.03, -1), (D / 2 + 0.03, 1)):
        iron.append(box2(W - 0.17, W - 0.13, y - 0.012, y + 0.012, 0.92, 1.12, M['iron']))
        iron.append(cyl(0.022, 0.06, (W - 0.15, y + s * 0.02, 1.0), M['iron'], rot=(math.pi / 2, 0, 0), verts=8))
    export('door.glb', [join(wood, 'leaf'), join(iron, 'iron')])


def build_door_metal():
    reset_scene()
    W, H, D = 1.0, 2.0, 0.06
    leaf = [box2(0.0, W, -D / 2, D / 2, 0.0, H, M['doormetal'], 0.008)]
    for y in (-D / 2 - 0.006, D / 2):
        for z0, z1 in ((0.12, 0.9), (1.05, 1.88)):
            leaf.append(box2(0.12, W - 0.12, y, y + 0.006, z0, z1, M['doormetal']))
    iron = []
    for y, s in ((-D / 2 - 0.04, -1), (D / 2 + 0.04, 1)):
        iron.append(box2(W - 0.2, W - 0.06, y - 0.012, y + 0.012, 0.98, 1.02, M['iron']))
        iron.append(box2(W - 0.11, W - 0.08, min(y, y - s * 0.03), max(y, y - s * 0.03), 0.97, 1.03, M['iron']))
    for z in (0.3, 1.0, 1.7):
        iron.append(cyl(0.022, 0.14, (0.0, 0.0, z), M['iron'], verts=8))
    export('door_metal.glb', [join(leaf, 'leaf'), join(iron, 'iron')])


# ---------------------------------------------------------------- meubels (maten = PROP_DIMS in shared.js)

def build_table():
    reset_scene()
    o = [box2(-0.6, 0.6, -0.4, 0.4, 0.74, 0.8, M['furn'], 0.01)]
    for x in (-0.52, 0.52):
        for y in (-0.32, 0.32):
            o.append(box2(x - 0.04, x + 0.04, y - 0.04, y + 0.04, 0.0, 0.74, M['darkwood']))
    o.append(box2(-0.5, 0.5, -0.03, 0.03, 0.18, 0.24, M['darkwood']))
    export('table.glb', [join(o, 'table')])


def build_shelf():
    reset_scene()
    o, items = [], []
    o.append(box2(-0.6, -0.56, -0.22, 0.22, 0, 1.9, M['furn']))
    o.append(box2(0.56, 0.6, -0.22, 0.22, 0, 1.9, M['furn']))
    o.append(box2(-0.6, 0.6, 0.18, 0.22, 0, 1.9, M['darkwood']))
    for z in (0.05, 0.55, 1.05, 1.5, 1.86):
        o.append(box2(-0.56, 0.56, -0.22, 0.18, z, z + 0.04, M['furn']))
    rnd = random.Random(5)
    for z in (0.09, 0.59, 1.09, 1.54):
        x = -0.5
        while x < 0.42:
            w = rnd.uniform(0.08, 0.2)
            hgt = rnd.uniform(0.12, 0.34)
            m = rnd.choice([M['jar'], M['can'], M['cloth'], M['darkwood']])
            if rnd.random() < 0.8:
                items.append(box2(x, x + w, -0.15, 0.12, z, z + hgt, m))
            x += w + rnd.uniform(0.02, 0.08)
    export('shelf.glb', [join(o, 'shelf'), join(items, 'items')])


def build_bunk():
    reset_scene()
    o, cl = [], []
    for x in (-0.97, 0.97):
        for y in (-0.42, 0.42):
            o.append(box2(x - 0.04, x + 0.04, y - 0.04, y + 0.04, 0, 1.6, M['darkwood']))
    for z in (0.32, 1.2):
        o.append(box2(-1.0, 1.0, -0.45, -0.38, z, z + 0.1, M['furn']))
        o.append(box2(-1.0, 1.0, 0.38, 0.45, z, z + 0.1, M['furn']))
        cl.append(box2(-0.93, 0.93, -0.38, 0.38, z + 0.05, z + 0.2, M['cloth2'], 0.03))
        cl.append(box2(-0.3, 0.93, -0.39, 0.39, z + 0.2, z + 0.24, M['cloth'], 0.02))
        cl.append(box2(-0.9, -0.55, -0.3, 0.3, z + 0.2, z + 0.3, M['cloth2'], 0.04))
    o.append(box2(-1.0, -0.94, -0.38, 0.38, 1.2, 1.55, M['furn']))
    o.append(box2(0.94, 1.0, -0.38, 0.38, 1.2, 1.55, M['furn']))
    # laddertje aan de zijkant
    for z in (0.55, 0.85):
        o.append(box2(0.7, 0.9, -0.47, -0.45, z, z + 0.04, M['darkwood']))
    export('bunk.glb', [join(o, 'bunk'), join(cl, 'cloth')])


def build_stove():
    reset_scene()
    o = [box2(-0.26, 0.26, -0.26, 0.26, 0.14, 0.78, M['stoveiron'], 0.02),
         box2(-0.3, 0.3, -0.3, 0.3, 0.78, 0.85, M['stoveiron'], 0.01)]
    for x in (-0.2, 0.2):
        for y in (-0.2, 0.2):
            o.append(box2(x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0, 0.14, M['stoveiron']))
    o.append(box2(-0.15, 0.15, -0.275, -0.26, 0.28, 0.58, M['iron']))
    f = [box2(-0.1, 0.1, -0.28, -0.272, 0.32, 0.5, M['fire'])]
    o.append(cyl(0.08, 0.12, (0, 0, 0.91), M['stoveiron'], verts=10))
    export('stove.glb', [join(o, 'stove'), join(f, 'fire')])


def build_pew():
    reset_scene()
    o = [box2(-1.5, 1.5, -0.3, 0.12, 0.42, 0.48, M['furn'], 0.01),
         box2(-1.5, 1.5, 0.18, 0.24, 0.5, 0.9, M['furn'], 0.01)]
    for x in (-1.42, 1.42):
        o.append(box2(x - 0.05, x + 0.05, -0.3, 0.26, 0, 0.92, M['darkwood']))
    o.append(box2(-1.4, 1.4, 0.05, 0.12, 0.12, 0.2, M['darkwood']))
    export('pew.glb', [join(o, 'pew')])


def build_lantern():
    reset_scene()
    o = [box2(-0.08, 0.08, -0.08, 0.08, 0.0, 0.03, M['iron']),
         box2(-0.08, 0.08, -0.08, 0.08, 0.2, 0.23, M['iron'])]
    for x in (-0.07, 0.07):
        for y in (-0.07, 0.07):
            o.append(box2(x - 0.01, x + 0.01, y - 0.01, y + 0.01, 0.0, 0.23, M['iron']))
    o.append(cyl(0.03, 0.06, (0, 0, 0.26), M['iron'], verts=8))
    g = [box2(-0.055, 0.055, -0.055, 0.055, 0.03, 0.2, M['glow'])]
    export('lantern.glb', [join(o, 'frame'), join(g, 'glow')])


build_cabin()
build_door()
build_door_metal()
build_table()
build_shelf()
build_bunk()
build_stove()
build_pew()
build_lantern()
