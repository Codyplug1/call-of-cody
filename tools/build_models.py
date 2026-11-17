"""
Bouwt alle 3D-modellen voor de game met Blender en exporteert ze als .glb.

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/build_models.py

Assen: Blender is Z-omhoog. De glTF-export zet dat om naar Y-omhoog.
Modellen kijken in Blender naar -Y, zodat ze in de game naar +Z kijken (de 'voorkant' in game.js).

Contract met public/game.js (niet veranderen zonder game.js aan te passen):
  soldier.glb : knooppunten 'legL' / 'legR' (draaipunt = heup op (+-0.14, 0, 0.9)) en 'body';
                materiaal 'Tint' = teamkleur (helmband, armband, rugpatch). Voeten op z=0, ~1.95 m hoog.
                Handen: rechts op de pistoolgreep, geweer-oorsprong op (0.13, -0.36, 1.24).
  rifle.glb   : oorsprong = pistoolgreep, loop naar -Y op z=0.07, mondingspunt y=-0.88.
  shotgun.glb : oorsprong = pistoolgreep, loop naar -Y op z=0.075, monding y=-0.77.
  pine.glb    : 'trunk' en 'foliage' (oorsprong aan de voet). Foliage heeft vertexkleuren (COLOR_0).
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
random.seed(7)
np.random.seed(7)


# ---------------------------------------------------------------- basis

def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def make_image(name, rgb):
    """rgb: numpy array (h, w, 3) met waarden 0..1 -> verpakte Blender-afbeelding."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


_mats = {}


def material(name, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0, image=None, vcol=False):
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
        # vertexkleur rechtstreeks als basiskleur (glTF: COLOR_0, basecolor-factor 1)
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    _mats[name] = m
    return m


# Materialen met box-projectie-UV's (wereldcoordinaten * schaal = herhalingen per meter),
# zodat de textuur op alle onderdelen even groot is.
TEX_UV = {'Camo': 1.45, 'CrateWood': 1 / 1.1, 'HelmetCover': 3.2}


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


def finish(o, mat, bevel=0.0, smooth=False, segs=2, harden=False, angle=50):
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if mat.name in TEX_UV:
        box_uv(o, TEX_UV[mat.name])
    if harden:
        bpy.ops.object.shade_smooth()
    if bevel > 0:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
        if harden:
            try:
                mod.harden_normals = True
            except Exception:
                pass
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth and not harden:
        shade_by_angle(angle)
    o.select_set(False)
    return o


def box(size, loc, mat, bevel=0.012, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, bevel, segs=1 if bevel <= 0.005 else 2)


def rbox(size, loc, mat, r=0.015, rot=(0, 0, 0), segs=1):
    """Afgeronde doos (bevel + 'harden normals': platte vlakken blijven vlak, randen zacht)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, r, segs=segs, harden=True)


def cyl(r, depth, loc, mat, rot=(0, 0, 0), verts=12, r2=None, bevel=0.0, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, mat, bevel, smooth)


def ball(r, loc, mat, scale=(1, 1, 1), seg=8, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return finish(o, mat, smooth=True, angle=80)


def segment(p1, p2, thick, mat, bevel=0.02, thick2=None):
    """Balk van p1 naar p2. thick = breedte (X na rotatie), thick2 = dikte."""
    a, b = Vector(p1), Vector(p2)
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    o = bpy.context.active_object
    o.scale = (thick, thick if thick2 is None else thick2, d.length + (thick * 0.6 if thick2 is None else 0))
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, bevel)


def mesh_object(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def loft(sections, mat, n=12, e=1.0, caps=(True, True), u=(1, 0, 0), v=(0, 1, 0),
         smooth=True, angle=50, vscale=1.0):
    """Buis door doorsneden. sections: (centrum, rx, ry[, exponent[, U, V]]).
    exponent < 1 = hoekiger (superellips). U/V = assen van de doorsnede."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rings = []
    for s in sections:
        c = Vector(s[0])
        rx, ry = s[1], s[2]
        ee = s[3] if len(s) > 3 and s[3] is not None else e
        U = Vector(s[4]) if len(s) > 4 else Vector(u)
        V = Vector(s[5]) if len(s) > 5 else Vector(v)
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            ca, sa = math.cos(a), math.sin(a)
            x = math.copysign(abs(ca) ** ee, ca) * rx
            y = math.copysign(abs(sa) ** ee, sa) * ry
            ring.append(bm.verts.new(c + U * x + V * y))
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


def limb(p1, p2, prof, mat, n=10, e=1.0, angle=60):
    """Ledemaat van p1 naar p2; prof: (t, rx, ry), t=0 bij p1, t=1 bij p2."""
    a, b = Vector(p1), Vector(p2)
    d = (b - a).normalized()
    X = Vector((1, 0, 0))
    U = X - d * X.dot(d)
    if U.length < 1e-3:
        U = Vector((0, 1, 0)) - d * d.y
    U.normalize()
    V = d.cross(U).normalized()
    secs = [(a + (b - a) * t, rx, ry, None, U, V) for (t, rx, ry) in prof]
    return loft(secs, mat, n=n, e=e, angle=angle)


def join(objs, name, origin=(0, 0, 0)):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.location = (0, 0, 0) if origin == (0, 0, 0) else o.location
    o.select_set(False)
    return o


def export(filename, objs=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in (objs or bpy.context.scene.objects):
        o.select_set(True)
    path = os.path.join(OUT, filename)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='MATERIAL', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    tris = 0
    for o in (objs or []):
        if o.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('Geexporteerd:', path, round(os.path.getsize(path) / 1024), 'KB', tris, 'tris')


# ---------------------------------------------------------------- textures (zelf gegenereerd)

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


def camo_texture():
    s = 256
    a = tile_noise(s, [3, 5, 8, 12], 11)
    b = tile_noise(s, [4, 6, 10, 15], 23)
    c = tile_noise(s, [5, 8, 12, 18], 37)
    base = np.array([0.50, 0.47, 0.33])      # kaki
    olive = np.array([0.30, 0.34, 0.19])
    brown = np.array([0.33, 0.24, 0.15])
    black = np.array([0.10, 0.12, 0.09])
    img = np.tile(base, (s, s, 1))
    img[a > 0.52] = olive
    img[b > 0.62] = brown
    img[c > 0.72] = black
    y, x = np.mgrid[0:s, 0:s]
    weave = (((x + y) % 3) == 0)[:, :, None] * 0.025          # fijne stofstructuur (ripstop)
    grain = np.random.rand(s, s, 1) * 0.06 - 0.03
    return make_image('camo', img * (1 - weave) + grain)


def helmet_cover_texture():
    s = 128
    a = tile_noise(s, [3, 5, 8], 71)
    b = tile_noise(s, [5, 9, 14], 83)
    img = np.tile(np.array([0.36, 0.37, 0.25]), (s, s, 1))
    img[a > 0.58] = np.array([0.27, 0.30, 0.18])
    img[b > 0.68] = np.array([0.40, 0.35, 0.24])
    y, x = np.mgrid[0:s, 0:s]
    weave = ((x % 2) ^ (y % 2))[:, :, None] * 0.03
    return make_image('helmetcover', img * (1 - weave) + np.random.rand(s, s, 1) * 0.05 - 0.025)


def wood_texture(name, tint, planks=4, s=128):
    y = np.arange(s)[:, None] / s
    x = np.arange(s)[None, :] / s
    rnd = np.random.default_rng(len(name))
    shade = rnd.uniform(-0.08, 0.08, planks)
    plank = shade[(np.floor(y * planks).astype(int) % planks)]
    gaps = (np.abs((y * planks) % 1) < 0.035).astype(float) * 0.45
    fine = np.repeat(np.random.rand(s, 1), s, axis=1)                         # nerf in de lengterichting
    grain = (np.sin(x * 23 + np.sin(y * 19) * 0.8 + np.floor(y * planks) * 1.7) * 0.03
             + (fine - 0.5) * 0.08 + np.random.rand(s, s) * 0.04)
    v = 1 + plank - gaps + grain
    return make_image(name, np.array(tint)[None, None, :] * v[:, :, None])


def burlap_texture():
    s = 64
    y, x = np.mgrid[0:s, 0:s]
    weave = ((x % 4 < 2) ^ (y % 4 < 2)).astype(float) * 0.07
    v = 0.93 + weave + np.random.rand(s, s) * 0.08
    return make_image('burlap', np.array([0.56, 0.49, 0.34])[None, None, :] * v[:, :, None])


def rock_texture():
    s = 128
    n1 = tile_noise(s, [3, 5, 9, 14], 51)
    n2 = tile_noise(s, [6, 10, 17], 63)
    v = 0.75 + 0.35 * n1 + np.random.rand(s, s) * 0.08
    img = np.array([0.36, 0.35, 0.33])[None, None, :] * v[:, :, None]
    moss = np.clip((n2 - 0.62) * 4, 0, 1)[:, :, None]
    img = img * (1 - moss) + np.array([0.20, 0.25, 0.12])[None, None, :] * moss * v[:, :, None]
    return make_image('rocktex', img)


def bark_texture():
    """Licht warmbruine schors met verticale groeven (sRGB-waarden, leest bruin onder ACES)."""
    s = 128
    rng = np.random.default_rng(5)
    y, x = np.mgrid[0:s, 0:s] / s
    f = np.zeros((s, s))
    for k in (5, 9, 14):
        for _ in range(2):
            f += np.sin(2 * math.pi * (k * x + rng.integers(-1, 2) * y) + np.sin(2 * math.pi * 2 * y + rng.uniform(0, 6)) * 0.8
                        + rng.uniform(0, 6)) / k
    f = (f - f.min()) / (f.max() - f.min())
    ridges = np.clip((f - 0.25) * 1.8, 0, 1)
    plates = tile_noise(s, [4, 7], 9)
    v = 0.62 + 0.38 * ridges + 0.08 * plates + rng.random((s, s)) * 0.08
    light = np.array([0.60, 0.44, 0.31])
    dark = np.array([0.34, 0.24, 0.17])
    img = dark[None, None, :] + (light - dark)[None, None, :] * np.clip(v - 0.35, 0, 1)[:, :, None] * 1.3
    return make_image('bark', img)


CAMO = camo_texture()
M = {
    'camo': material('Camo', (1, 1, 1), 0.9, image=CAMO),
    'vest': material('Vest', (0.24, 0.26, 0.17), 0.85),
    'webbing': material('Webbing', (0.16, 0.17, 0.12), 0.9),
    'scarf': material('Scarf', (0.20, 0.21, 0.14), 0.95),
    'boot': material('Boot', (0.20, 0.15, 0.10), 0.75),
    'sole': material('Sole', (0.05, 0.05, 0.045), 0.9),
    'skin': material('Skin', (0.62, 0.45, 0.34), 0.7),
    'glove': material('Glove', (0.12, 0.12, 0.11), 0.8),
    'helmet': material('HelmetCover', (1, 1, 1), 0.85, image=helmet_cover_texture()),
    'lens': material('Lens', (0.05, 0.06, 0.07), 0.15, 0.4),
    'tint': material('Tint', (0.8, 0.1, 0.1), 0.6),    # teamkleur, wordt in de game vervangen
    'gun': material('Gunmetal', (0.06, 0.06, 0.07), 0.45, 0.6),
    'polymer': material('Polymer', (0.12, 0.12, 0.12), 0.7),
    'fde': material('FDE', (0.30, 0.28, 0.20), 0.75),
    'woodgun': material('GunWood', (0.36, 0.21, 0.11), 0.6),
    'shell': material('ShotShell', (0.40, 0.07, 0.05), 0.55),
    'crate': material('CrateWood', (1, 1, 1), 0.85, image=wood_texture('cratewood', (0.55, 0.42, 0.26), planks=5, s=256)),
    'crateframe': material('CrateFrame', (0.32, 0.24, 0.15), 0.85),
    'stencil': material('Stencil', (0.08, 0.07, 0.05), 0.9),
    'towerwood': material('TowerWood', (1, 1, 1), 0.9, image=wood_texture('towerwood', (0.40, 0.31, 0.21))),
    'roof': material('Roof', (0.13, 0.15, 0.11), 0.8, 0.3),
    'burlap': material('Burlap', (1, 1, 1), 0.95, image=burlap_texture()),
    'bark': material('Bark', (1, 1, 1), 0.95, image=bark_texture()),
    'needles': material('Needles', (1, 1, 1), 0.9, vcol=True),
    'rock': material('Rock', (1, 1, 1), 0.95, image=rock_texture()),
    'metal': material('Metal', (0.30, 0.31, 0.30), 0.5, 0.7),
}


# ---------------------------------------------------------------- soldaat

HC = Vector((0, 0.008, 1.772))      # helmcentrum
HR = (0.150, 0.172, 0.150)          # helmstralen


def helm_phi_min(a):
    """Onderrand van de helm per hoek a (rad, voorkant = -90 graden): voor hoger, oren lager."""
    s = math.sin(a)
    c = abs(math.cos(a))
    return math.radians(17 * max(0.0, -s) ** 1.5 - 11 * c ** 2 - 6 * max(0.0, s) ** 2)


def helm_pt(t, a, s=1.0):
    pm = helm_phi_min(a)
    phi = pm + t * (math.pi / 2 - pm)
    rad = math.cos(phi) if phi >= 0 else 1 + 0.25 * (-phi)
    return Vector((HC.x + HR[0] * rad * math.cos(a) * s,
                   HC.y + HR[1] * rad * math.sin(a) * s,
                   HC.z + HR[2] * math.sin(phi) * s))


def shell(mat, t0, t1, rows, s=1.0, a0=0.0, a1=360.0, n=20, cap=False, smooth=True):
    """Stuk helmoppervlak (t = van rand 0 naar top 1, a in graden)."""
    full = (a1 - a0) >= 359.9
    cols = n if full else n + 1
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    grid = []
    for i in range(rows + 1):
        t = t0 + (t1 - t0) * i / rows
        row = []
        for k in range(cols):
            a = math.radians(a0 + (a1 - a0) * k / n)
            row.append(bm.verts.new(helm_pt(t, a, s)))
        grid.append(row)
    for i in range(rows):
        for k in range(n):
            k2 = (k + 1) % cols
            bm.faces.new((grid[i][k], grid[i][k2], grid[i + 1][k2], grid[i + 1][k]))
    if cap:
        top = bm.verts.new(helm_pt(1.0, 0, s))
        for k in range(n):
            bm.faces.new((grid[-1][k], grid[-1][(k + 1) % cols], top))
    o = mesh_object(bm, 'shell')
    return finish(o, mat, smooth=smooth, angle=70)


def band(cx, cy, rx, ry, z0, z1, a0, a1, n, mat):
    """Verticale gebogen strook (bril, banden)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    lo, hi = [], []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        lo.append(bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z0)))
        hi.append(bm.verts.new((cx + rx * math.cos(a) * 1.0, cy + ry * math.sin(a), z1)))
    for k in range(n):
        bm.faces.new((lo[k], lo[k + 1], hi[k + 1], hi[k]))
    o = mesh_object(bm, 'band')
    return finish(o, mat, smooth=True, angle=80)


def build_soldier():
    reset_scene()

    # ------------------------------------------------ benen (draaipunt heup)
    def leg(side):
        x = 0.14 * side
        sx = side
        objs = [
            # dij + scheen in een stuk, met knie en kuit
            loft([((sx * 0.112, 0.0, 0.99), 0.098, 0.118),
                  ((sx * 0.116, -0.004, 0.90), 0.100, 0.118),
                  ((sx * 0.123, -0.010, 0.75), 0.088, 0.100),
                  ((sx * 0.130, -0.012, 0.60), 0.072, 0.082),
                  ((sx * 0.133, -0.010, 0.51), 0.066, 0.076),
                  ((sx * 0.136, 0.002, 0.42), 0.066, 0.082),
                  ((sx * 0.140, 0.012, 0.30), 0.056, 0.066),
                  ((sx * 0.140, 0.016, 0.22), 0.064, 0.072),     # broekpijp over de schacht
                  ((sx * 0.140, 0.016, 0.19), 0.060, 0.068)],
                 M['camo'], n=12, caps=(False, True), angle=60),
            # kniebeschermer
            loft([((sx * 0.134, -0.072, 0.56), 0.050, 0.020),
                  ((sx * 0.134, -0.090, 0.505), 0.058, 0.026),
                  ((sx * 0.134, -0.074, 0.44), 0.048, 0.020)],
                 M['webbing'], n=10, u=(1, 0, 0), v=(0, 1, 0), e=0.7),
            # schacht van de laars
            loft([((x, 0.018, 0.05), 0.066, 0.075), ((x, 0.018, 0.13), 0.064, 0.072),
                  ((x, 0.016, 0.215), 0.061, 0.069)], M['boot'], n=12, e=0.85),
            # voet (loft van hiel naar neus), hoekig van onder
            loft([((x, 0.090, 0.055), 0.048, 0.040),
                  ((x, 0.075, 0.068), 0.062, 0.062),
                  ((x, 0.010, 0.072), 0.066, 0.068),
                  ((x, -0.075, 0.055), 0.066, 0.052),
                  ((x, -0.150, 0.045), 0.060, 0.042),
                  ((x, -0.195, 0.040), 0.044, 0.030)],
                 M['boot'], n=12, e=0.6, u=(1, 0, 0), v=(0, 0, 1)),
            # zool
            loft([((x, 0.095, 0.014), 0.054, 0.014),
                  ((x, 0.040, 0.014), 0.068, 0.014),
                  ((x, -0.100, 0.014), 0.071, 0.014),
                  ((x, -0.190, 0.016), 0.054, 0.016),
                  ((x, -0.212, 0.022), 0.034, 0.012)],
                 M['sole'], n=10, e=0.4, u=(1, 0, 0), v=(0, 0, 1)),
        ]
        if side < 0:   # dijtas aan de buitenkant
            objs.append(rbox((0.05, 0.15, 0.17), (x - 0.088, -0.01, 0.69), M['webbing'], 0.015))
            objs.append(rbox((0.056, 0.155, 0.045), (x - 0.09, -0.01, 0.765), M['vest'], 0.012))
        else:          # beenzak in camo
            objs.append(rbox((0.04, 0.14, 0.15), (x + 0.088, -0.005, 0.70), M['camo'], 0.015))
        return join(objs, 'legL' if side < 0 else 'legR', origin=(x, 0, 0.9))

    legL = leg(-1)
    legR = leg(1)

    body = []
    # ------------------------------------------------ romp
    body.append(loft([((0, 0.0, 0.84), 0.150, 0.100), ((0, 0.0, 0.90), 0.185, 0.120),
                      ((0, 0.0, 1.00), 0.190, 0.125), ((0, 0.0, 1.06), 0.180, 0.120)],
                     M['camo'], n=16, e=0.85))                                         # heup
    body.append(loft([((0, 0.0, 1.02), 0.170, 0.115), ((0, 0.0, 1.15), 0.176, 0.120),
                      ((0, 0.0, 1.30), 0.200, 0.130), ((0, 0.0, 1.42), 0.214, 0.130),
                      ((0, 0.005, 1.50), 0.208, 0.120), ((0, 0.01, 1.56), 0.150, 0.100),
                      ((0, 0.01, 1.60), 0.075, 0.072)],
                     M['camo'], n=16, e=0.85))                                         # bovenlijf
    body.append(loft([((0, 0.0, 1.000), 0.197, 0.133), ((0, 0.0, 1.062), 0.197, 0.133)],
                     M['webbing'], n=16, e=0.7, smooth=True))                          # riem
    body.append(rbox((0.06, 0.02, 0.045), (0, -0.135, 1.031), M['metal'], 0.006))      # gesp
    # plate carrier
    body.append(rbox((0.30, 0.05, 0.34), (0, -0.150, 1.330), M['vest'], 0.022, segs=3))   # voorplaat
    body.append(rbox((0.32, 0.05, 0.36), (0, 0.148, 1.350), M['vest'], 0.022, segs=3))    # achterplaat
    body.append(loft([((0, 0.0, 1.13), 0.205, 0.150), ((0, 0.0, 1.29), 0.208, 0.152)],
                     M['vest'], n=16, e=0.6))                                           # cummerbund
    for sx in (-1, 1):                                                                  # schouderbanden
        pts = [(sx * 0.10, -0.168, 1.49), (sx * 0.112, -0.06, 1.588), (sx * 0.112, 0.06, 1.588), (sx * 0.10, 0.168, 1.51)]
        for p, q in zip(pts, pts[1:]):
            body.append(segment(p, q, 0.068, M['vest'], 0.008, thick2=0.024))
    for i, px in enumerate((-0.098, 0.0, 0.098)):                                      # magazijntassen
        body.append(rbox((0.084, 0.046, 0.115), (px, -0.196, 1.225), M['vest'], 0.012))
        body.append(rbox((0.090, 0.052, 0.032), (px, -0.198, 1.288), M['webbing'], 0.01))
        body.append(rbox((0.03, 0.006, 0.03), (px, -0.222, 1.255), M['webbing'], 0.003))
    body.append(rbox((0.17, 0.035, 0.085), (0, -0.19, 1.43), M['webbing'], 0.012))      # admin-tas
    body.append(rbox((0.24, 0.012, 0.012), (0, -0.177, 1.355), M['webbing'], 0.003))   # MOLLE-banden
    body.append(rbox((0.24, 0.012, 0.012), (0, -0.177, 1.385), M['webbing'], 0.003))
    body.append(rbox((0.055, 0.085, 0.13), (-0.225, 0.04, 1.24), M['webbing'], 0.012))  # radiotas
    body.append(cyl(0.008, 0.26, (-0.235, 0.07, 1.42), M['polymer'], verts=6))         # antenne
    body.append(cyl(0.032, 0.11, (0.23, 0.0, 1.22), M['webbing'], verts=10))          # granaattas
    body.append(rbox((0.13, 0.07, 0.09), (0.11, 0.135, 1.0), M['webbing'], 0.02))      # dumptas
    # rugzak (aanvalspakket) met teampatch
    body.append(rbox((0.29, 0.13, 0.36), (0, 0.235, 1.34), M['vest'], 0.04, segs=3))
    body.append(rbox((0.23, 0.04, 0.22), (0, 0.305, 1.30), M['webbing'], 0.02))
    body.append(rbox((0.09, 0.012, 0.055), (0, 0.327, 1.36), M['tint'], 0.006))
    body.append(cyl(0.058, 0.32, (0, 0.24, 1.565), M['webbing'], rot=(0, math.pi / 2, 0), verts=12))  # slaapmat
    for sx in (-1, 1):
        body.append(rbox((0.04, 0.09, 0.2), (sx * 0.158, 0.235, 1.30), M['webbing'], 0.015))  # zijvakken

    # ------------------------------------------------ hoofd
    body.append(cyl(0.058, 0.1, (0, 0.0, 1.6), M['skin'], verts=12))                  # nek
    body.append(loft([((0, -0.000, 1.615), 0.064, 0.072), ((0, -0.008, 1.665), 0.078, 0.092),
                      ((0, -0.010, 1.735), 0.086, 0.102), ((0, -0.004, 1.800), 0.086, 0.100),
                      ((0, 0.004, 1.860), 0.070, 0.084)], M['skin'], n=14))            # hoofd
    body.append(rbox((0.024, 0.026, 0.038), (0, -0.112, 1.730), M['skin'], 0.008))     # neus
    body.append(loft([((0, 0.0, 1.565), 0.078, 0.078), ((0, -0.008, 1.625), 0.084, 0.096),
                      ((0, -0.012, 1.665), 0.089, 0.105), ((0, -0.012, 1.688), 0.088, 0.104)],
                     M['scarf'], n=14, caps=(False, False)))                             # nekwarmer
    body.append(band(0, -0.010, 0.093, 0.110, 1.744, 1.778, -150, -30, 10, M['lens']))  # schietbril
    for sx in (-1, 1):
        body.append(cyl(0.046, 0.04, (sx * 0.104, 0.0, 1.725), M['polymer'], rot=(0, math.pi / 2, 0), verts=12))  # headset
        body.append(cyl(0.030, 0.012, (sx * 0.128, 0.0, 1.725), M['webbing'], rot=(0, math.pi / 2, 0), verts=10))
    body.append(limb((-0.098, 0.03, 1.69), (0.0, -0.035, 1.625), [(0, 0.008, 0.003), (1, 0.008, 0.003)], M['webbing'], n=4))  # mic-arm

    # ------------------------------------------------ helm
    body.append(shell(M['helmet'], 0.0, 0.88, 5, cap=True))
    body.append(shell(M['tint'], 0.05, 0.20, 1, s=1.035))                              # teamband
    body.append(shell(M['webbing'], 0.34, 0.44, 1, s=1.05))                            # brilband
    body.append(shell(M['polymer'], 0.28, 0.50, 1, s=1.07, a0=-132, a1=-48, n=8))      # stofbril (frame)
    body.append(shell(M['lens'], 0.31, 0.47, 1, s=1.085, a0=-126, a1=-54, n=8))         # stofbril (glas)
    p = helm_pt(0.66, math.radians(-90), 1.0)
    body.append(rbox((0.07, 0.035, 0.05), (p.x, p.y - 0.008, p.z), M['polymer'], 0.008, rot=(math.radians(-25), 0, 0)))  # NVG-houder
    for sx in (-1, 1):                                                                  # helmrails
        q = helm_pt(0.2, 0 if sx > 0 else math.pi, 1.0)
        body.append(rbox((0.022, 0.10, 0.026), (q.x + sx * 0.004, q.y - 0.01, q.z), M['polymer'], 0.006))
        # kinriem
        body.append(limb((sx * 0.112, 0.02, 1.75), (sx * 0.035, -0.07, 1.6), [(0, 0.01, 0.003), (1, 0.01, 0.003)], M['webbing'], n=4))
    q = helm_pt(0.24, math.radians(90), 1.02)
    body.append(rbox((0.11, 0.045, 0.07), (q.x, q.y, q.z), M['webbing'], 0.014, rot=(math.radians(20), 0, 0)))  # tegengewicht

    # ------------------------------------------------ armen in schiethouding
    # hand op +X aan de pistoolgreep, andere hand om de magazijnschacht/achterkant
    # handbescherming (het geweer zit op x=0.13).
    rs, re, rh = Vector((0.27, -0.01, 1.47)), Vector((0.32, -0.15, 1.2)), Vector((0.13, -0.355, 1.225))
    ls, le, lh = Vector((-0.25, -0.04, 1.47)), Vector((-0.17, -0.34, 1.19)), Vector((0.085, -0.63, 1.245))
    upper = [(-0.08, 0.050, 0.050), (0.05, 0.070, 0.068), (0.45, 0.062, 0.058), (0.9, 0.054, 0.050), (1.06, 0.045, 0.045)]
    fore = [(-0.06, 0.046, 0.046), (0.08, 0.055, 0.052), (0.55, 0.048, 0.044), (0.88, 0.040, 0.036), (0.95, 0.042, 0.038)]
    for s_, e_, h_ in ((rs, re, rh), (ls, le, lh)):
        d = (h_ - e_).normalized()
        wrist = h_ - d * 0.055
        body.append(limb(s_, e_, upper, M['camo'], n=10))
        body.append(limb(e_, wrist, fore, M['camo'], n=10))
        body.append(ball(0.074, s_ + Vector((0, 0, 0.012)), M['camo'], scale=(1.0, 1.0, 0.95)))    # schouder
        body.append(ball(0.062, e_ + (e_ - s_).normalized() * 0.01 + Vector((0, 0, -0.008)),
                         M['webbing'], scale=(1.0, 1.0, 1.0), seg=10, rings=6))                    # elleboogstuk
        # handschoen: manchet, hand, vingers
        body.append(limb(wrist - d * 0.02, h_ + d * 0.06,
                         [(0, 0.044, 0.042), (0.18, 0.046, 0.044), (0.3, 0.040, 0.034), (0.65, 0.048, 0.034),
                          (0.92, 0.042, 0.032), (1.0, 0.030, 0.024)], M['glove'], n=10, e=0.8))
        side = Vector((0, 0, 1)).cross(d).normalized()
        body.append(limb(h_ - d * 0.015 + Vector((0, 0, 0.028)), h_ + d * 0.035 + Vector((0, 0, 0.034)) + side * 0.012,
                         [(0, 0.016, 0.016), (1, 0.013, 0.013), (1.15, 0.008, 0.008)], M['glove'], n=6))  # duim
    # armband (teamkleur) om de linker bovenarm
    body.append(limb(ls.lerp(le, 0.28), ls.lerp(le, 0.42), [(0, 0.069, 0.066), (1, 0.066, 0.062)], M['tint'], n=10))

    torso = join(body, 'body', origin=(0, 0, 0))
    export('soldier.glb', [legL, legR, torso])


# ---------------------------------------------------------------- wapens (oorsprong = greep, loop naar -Y)

def build_rifle():
    reset_scene()
    Y = (math.pi / 2, 0, 0)
    o = [
        box((0.052, 0.36, 0.06), (0, -0.1, 0.075), M['gun'], 0.006),                   # bovenste behuizing
        box((0.05, 0.26, 0.05), (0, -0.07, 0.025), M['gun'], 0.006),                   # onderste behuizing
        box((0.006, 0.07, 0.03), (0.027, -0.1, 0.075), M['polymer'], 0.002),           # uitwerpopening
        cyl(0.009, 0.03, (0.03, -0.035, 0.07), M['gun'], rot=(0, math.pi / 2, 0), verts=8),   # forward assist
        box((0.012, 0.05, 0.02), (-0.03, -0.02, 0.085), M['gun'], 0.003),              # spanhendel
        box((0.05, 0.045, 0.06), (0, -0.21, 0.005), M['gun'], 0.006),                  # magazijnschacht
        cyl(0.036, 0.36, (0, -0.46, 0.07), M['polymer'], rot=Y, verts=8, smooth=False),  # handbescherming (8-kant)
        box((0.022, 0.62, 0.014), (0, -0.33, 0.112), M['gun'], 0.003),                 # rail
        cyl(0.011, 0.25, (0, -0.735, 0.07), M['gun'], rot=Y, verts=12),                # loop
        box((0.03, 0.03, 0.035), (0, -0.67, 0.08), M['gun'], 0.004),                   # gasblok
        box((0.008, 0.012, 0.045), (0, -0.67, 0.12), M['gun'], 0.002),                 # korrel
        cyl(0.017, 0.07, (0, -0.845, 0.07), M['gun'], rot=Y, verts=10),                # vlamdemper (tip y=-0.88)
        box((0.012, 0.09, 0.008), (0, -0.02, -0.035), M['gun'], 0.002),                # trekkerbeugel
        box((0.006, 0.01, 0.024), (0, -0.03, -0.018), M['gun'], 0.002, rot=(math.radians(15), 0, 0)),  # trekker
        cyl(0.013, 0.18, (0, 0.13, 0.06), M['gun'], rot=Y, verts=10),                  # kolfbuis
        box((0.03, 0.05, 0.12), (0, -0.53, 0.0), M['polymer'], 0.008),                 # voorgreep
        # compact richtkijker
        cyl(0.018, 0.13, (0, -0.1, 0.16), M['gun'], rot=Y, verts=16),
        cyl(0.019, 0.04, (0, -0.18, 0.16), M['gun'], rot=Y, verts=16, r2=0.024),
        cyl(0.021, 0.006, (0, -0.2, 0.16), M['lens'], rot=Y, verts=16),
        cyl(0.021, 0.035, (0, -0.02, 0.16), M['gun'], rot=Y, verts=16),
        cyl(0.007, 0.02, (0.0, -0.1, 0.18), M['gun'], verts=8),                        # verstelknop
        box((0.022, 0.025, 0.035), (0, -0.06, 0.13), M['gun'], 0.003),                 # montage
        box((0.022, 0.025, 0.035), (0, -0.14, 0.13), M['gun'], 0.003),
    ]
    for sx in (-1, 1):                                                                 # zijrails handbescherming
        o.append(box((0.008, 0.16, 0.012), (sx * 0.035, -0.5, 0.07), M['gun'], 0.002))
    for yy in (-0.38, -0.43, -0.58):                                                   # ventilatiegaten
        for sx in (-1, 1):
            o.append(box((0.004, 0.025, 0.012), (sx * 0.034, yy, 0.05), M['gun'], 0.0))
    # gebogen magazijn
    secs = []
    for i in range(6):
        t = i / 5
        y = -0.212 - 0.025 * t - 0.075 * t * t
        z = 0.0 - 0.235 * t
        T = Vector((0, -0.025 - 0.15 * t, -0.235)).normalized()
        N = Vector((1, 0, 0)).cross(T)
        secs.append(((0, y, z), 0.017, 0.040 + 0.002 * t, 0.3, (1, 0, 0), tuple(N)))
    o.append(loft(secs, M['polymer'], n=12, angle=40))
    T = Vector((0, -0.175, -0.235)).normalized()                                       # bodemplaat haaks op het einde
    end = Vector(secs[-1][0]) + T * 0.004
    o.append(rbox((0.04, 0.094, 0.016), tuple(end), M['polymer'], 0.005, rot=(math.asin(T.y), 0, 0)))
    # pistoolgreep
    o.append(limb((0, 0.012, 0.0), (0, 0.05, -0.105), [(0, 0.018, 0.026), (0.5, 0.019, 0.028), (1, 0.018, 0.026)],
                  M['polymer'], n=10, e=0.55))
    # kolf
    o.append(loft([((0, 0.15, 0.060), 0.016, 0.022), ((0, 0.17, 0.052), 0.022, 0.036),
                   ((0, 0.24, 0.044), 0.023, 0.044), ((0, 0.29, 0.036), 0.024, 0.056)],
                  M['fde'], n=12, e=0.5, u=(1, 0, 0), v=(0, 0, 1), angle=40))
    o.append(rbox((0.05, 0.025, 0.125), (0, 0.305, 0.034), M['polymer'], 0.008))       # kolfplaat
    o.append(rbox((0.03, 0.09, 0.022), (0, 0.235, 0.096), M['fde'], 0.008))            # wangsteun
    export('rifle.glb', [join(o, 'rifle')])


def build_shotgun():
    reset_scene()
    Y = (math.pi / 2, 0, 0)
    o = [
        rbox((0.062, 0.3, 0.1), (0, -0.01, 0.05), M['gun'], 0.012),                       # behuizing
        box((0.05, 0.08, 0.06), (0, 0.15, 0.04), M['woodgun'], 0.012),                   # kolfhals
        cyl(0.019, 0.62, (0, -0.46, 0.075), M['gun'], rot=Y, verts=14),                   # loop
        cyl(0.016, 0.48, (0, -0.4, 0.035), M['gun'], rot=Y, verts=10),                    # buismagazijn
        cyl(0.018, 0.02, (0, -0.645, 0.035), M['gun'], rot=Y, verts=10),                  # magazijndop
        box((0.008, 0.6, 0.008), (0, -0.46, 0.097), M['gun'], 0.002),                    # ventilatierib
        box((0.006, 0.08, 0.03), (0.031, -0.03, 0.065), M['polymer'], 0.002),             # uitwerpopening
        box((0.012, 0.1, 0.008), (0, 0.02, -0.035), M['gun'], 0.002),                     # trekkerbeugel
        box((0.012, 0.008, 0.03), (0, -0.025, -0.02), M['gun'], 0.002),
        box((0.006, 0.01, 0.026), (0, 0.0, -0.02), M['gun'], 0.002, rot=(math.radians(12), 0, 0)),  # trekker
        box((0.04, 0.015, 0.035), (0, -0.67, 0.055), M['gun'], 0.003),                    # loopklem
        box((0.02, 0.06, 0.012), (0, 0.0, 0.106), M['gun'], 0.003),                       # vizier
        ball(0.006, (0, -0.76, 0.1), M['metal']),                                        # korrel
    ]
    for i in range(4):                                                                   # patronen in zijhouder
        o.append(cyl(0.01, 0.05, (0.038, -0.07 + i * 0.026, 0.05), M['shell'], verts=8))
    o.append(rbox((0.006, 0.12, 0.06), (0.033, -0.03, 0.05), M['polymer'], 0.003))
    # pomp met groeven
    secs = []
    for i in range(12):
        yy = -0.29 - i * 0.017
        r = 0.031 if i % 2 == 0 or i in (0, 11) else 0.028
        secs.append(((0, yy, 0.038), r * 0.95, r))
    o.append(loft(secs, M['woodgun'], n=12, u=(1, 0, 0), v=(0, 0, 1), angle=60))
    # pistoolgreep + kolf
    o.append(limb((0, 0.11, 0.02), (0, 0.16, -0.085), [(0, 0.020, 0.026), (0.6, 0.021, 0.028), (1, 0.019, 0.026)],
                  M['woodgun'], n=10, e=0.6))
    o.append(loft([((0, 0.14, 0.035), 0.022, 0.030), ((0, 0.20, 0.025), 0.024, 0.040),
                   ((0, 0.32, 0.005), 0.025, 0.052), ((0, 0.44, -0.012), 0.027, 0.062)],
                  M['woodgun'], n=12, e=0.6, u=(1, 0, 0), v=(0, 0, 1), angle=40))
    o.append(rbox((0.058, 0.035, 0.13), (0, 0.457, -0.012), M['polymer'], 0.012))     # terugslagkussen
    export('shotgun.glb', [join(o, 'shotgun')])


# ---------------------------------------------------------------- props

def build_sandbags():
    reset_scene()
    bags = []
    length, rows = 3.0, 4
    for r in range(rows):
        n = 5 if r % 2 == 0 else 6
        bw = length / 5.4
        offset = 0 if r % 2 == 0 else -bw / 2
        for i in range(n):
            x = -length / 2 + bw / 2 + i * bw + offset
            if x < -length / 2 + 0.1 or x > length / 2 - 0.1:
                continue
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=7, radius=0.5,
                                                 location=(x, random.uniform(-0.025, 0.025), 0.125 + r * 0.245))
            b = bpy.context.active_object
            # kussenvorm: bol -> afgeronde blokvorm (superellipsoide)
            for v in b.data.vertices:
                c = v.co * 2
                v.co = Vector([math.copysign(abs(k) ** 0.45, k) * 0.5 for k in c])
                v.co.z *= 1 - 0.25 * (abs(c.x) ** 2)          # uiteinden iets platter
            b.scale = (bw * 1.0, 0.66, 0.26)
            b.rotation_euler = (random.uniform(-0.03, 0.03), random.uniform(-0.04, 0.04), random.uniform(-0.06, 0.06))
            bags.append(finish(b, M['burlap'], smooth=True))
    export('sandbags.glb', [join(bags, 'sandbags')])


def build_crate():
    reset_scene()
    s = 1.1
    o = [box((s, s, s), (0, 0, s / 2), M['crate'], 0.01)]
    e = 0.08
    for x in (-1, 1):
        for y in (-1, 1):
            o.append(box((e, e, s + 0.01), (x * (s / 2 - e / 2 + 0.01), y * (s / 2 - e / 2 + 0.01), s / 2), M['crateframe'], 0.01))
    for z in (e / 2, s - e / 2):
        for y in (-1, 1):
            o.append(box((s + 0.02, e, e), (0, y * (s / 2 - e / 2 + 0.01), z), M['crateframe'], 0.01))
        for x in (-1, 1):
            o.append(box((e, s + 0.02, e), (x * (s / 2 - e / 2 + 0.01), 0, z), M['crateframe'], 0.01))
    # diagonale lat voor/achter, netjes binnen het frame
    for y in (-1, 1):
        yy = y * (s / 2 + 0.012)
        o.append(segment((-s / 2 + e * 0.9, yy, e * 0.9), (s / 2 - e * 0.9, yy, s - e * 0.9), 0.07, M['crateframe'], 0.005, thick2=0.03))
    # gestencilde code op de zijkanten (generieke 'letters' als blokjes)
    rs = random.Random(3)
    for x in (-1, 1):
        for i in range(5):
            hgt = 0.075 if i != 2 else 0.03
            o.append(box((0.004, 0.045, hgt), (x * (s / 2 + 0.002), -0.14 + i * 0.07, s * 0.64), M['stencil'], 0.0))
        o.append(box((0.004, 0.31, 0.022), (x * (s / 2 + 0.002), 0, s * 0.56), M['stencil'], 0.0))
        for i in range(3):
            o.append(box((0.004, 0.035, 0.05), (x * (s / 2 + 0.002), -0.06 + i * 0.06 + rs.uniform(-0.005, 0.005), s * 0.49), M['stencil'], 0.0))
    export('crate.glb', [join(o, 'crate')])


def build_tower():
    reset_scene()
    o = []
    # palen tot h + 2.0: je kunt rechtop op het platform staan (dak begint boven hoofdhoogte)
    h, a, post = 4.2, 1.25, 2.0
    for x in (-1, 1):
        for y in (-1, 1):
            o.append(segment((x * a * 1.15, y * a * 1.15, 0), (x * a, y * a, h + post), 0.18, M['towerwood'], 0.01))
    for z in (1.4, 2.8):
        for y in (-1, 1):
            o.append(box((a * 2.3, 0.1, 0.12), (0, y * a * 1.08, z), M['towerwood'], 0.01))
        for x in (-1, 1):
            o.append(box((0.1, a * 2.3, 0.12), (x * a * 1.08, 0, z), M['towerwood'], 0.01))
    # schoren (kruisverband) aan de zijkanten en achterkant, voorkant blijft vrij voor de ladder
    for z0, z1 in ((0.2, 1.4), (1.4, 2.8), (2.8, 4.1)):
        f0, f1 = 1.15 - 0.15 * z0 / (h + 1.1), 1.15 - 0.15 * z1 / (h + 1.1)
        for x in (-1, 1):
            o.append(segment((x * a * f0 + x * 0.06, -a * f0, z0), (x * a * f1 + x * 0.06, a * f1, z1), 0.08, M['towerwood'], 0.005))
        o.append(segment((-a * f0, a * f0 + 0.06, z0), (a * f1, a * f1 + 0.06, z1), 0.08, M['towerwood'], 0.005))
    o.append(box((a * 2.6, a * 2.6, 0.16), (0, 0, h), M['towerwood'], 0.01))               # vloer
    # borstwering (0.9 m); aan de ladderkant (-Y in Blender = +Z in de game) een opening van 1.12 m
    # (zelfde maten als TOWER_PLATFORM in public/shared.js)
    o.append(box((a * 2.6, 0.08, 0.9), (0, a * 1.28, h + 0.5), M['towerwood'], 0.01))
    gap, half = 0.56, a * 1.3
    seg = half - gap
    for x in (-1, 1):
        o.append(box((seg, 0.08, 0.9), (x * (gap + seg / 2), -a * 1.28, h + 0.5), M['towerwood'], 0.01))
    o.append(box((0.08, a * 2.6, 0.9), (a * 1.28, 0, h + 0.5), M['towerwood'], 0.01))
    o.append(box((0.08, a * 2.6, 0.9), (-a * 1.28, 0, h + 0.5), M['towerwood'], 0.01))
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=a * 2.1, radius2=0.1, depth=1.1, location=(0, 0, h + post + 0.55), rotation=(0, 0, math.pi / 4))
    o.append(finish(bpy.context.active_object, M['roof']))
    for i in range(9):                                                                       # ladder
        o.append(box((0.6, 0.06, 0.06), (0, -a * 1.2 - 0.05, 0.4 + i * 0.45), M['towerwood'], 0.005))
    for x in (-0.3, 0.3):
        o.append(box((0.07, 0.07, h), (x, -a * 1.2 - 0.05, h / 2), M['towerwood'], 0.005))
    export('tower.glb', [join(o, 'tower')])


def jitter_mesh(o, amount, seed):
    rnd = random.Random(seed)
    for v in o.data.vertices:
        v.co.x += rnd.uniform(-amount, amount)
        v.co.y += rnd.uniform(-amount, amount)
        v.co.z += rnd.uniform(-amount, amount) * 0.5


# ---------------------------------------------------------------- den

NEEDLE = (0.070, 0.135, 0.058)     # lineaire basiskleur naalden (wordt vermenigvuldigd per vertex)


def pine_tier(bm, cols, z, h, r, nb, rnd, bright, tipdroop=1.0):
    """Eén takkenkrans: gekartelde ster met per tak een rug (binnenring), afhangende
    taktoppen en een holle onderkant. Vertexkleur: lichte toppen, donker binnenin/onder."""
    tint = (rnd.uniform(0.85, 1.2), rnd.uniform(0.92, 1.08), rnd.uniform(0.8, 1.15))
    k0 = bright * rnd.uniform(0.88, 1.1)

    def col(f, yellow=0.0):
        return (min(1, NEEDLE[0] * tint[0] * f * (1 + yellow * 0.9)),
                min(1, NEEDLE[1] * tint[1] * f * (1 + yellow * 0.25)),
                min(1, NEEDLE[2] * tint[2] * f))

    def vert(p, c):
        cols.append(c)
        return bm.verts.new(p)

    rot = rnd.uniform(0, 2 * math.pi)
    cx, cy = rnd.uniform(-0.07, 0.07), rnd.uniform(-0.07, 0.07)
    top = vert((cx, cy, z + h), col(k0 * 1.0))
    inner, outer = [], []
    for k in range(2 * nb):
        ang = rot + k * math.pi / nb + rnd.uniform(-0.14, 0.14)
        ca, sa = math.cos(ang), math.sin(ang)
        if k % 2 == 0:      # tak
            L = rnd.uniform(0.74, 1.14)
            ro, zo = r * L, z - r * rnd.uniform(0.14, 0.32) * L * tipdroop
            ri, zi = r * 0.46 * L, z + h * rnd.uniform(0.36, 0.46)
            co, ci = col(k0 * 1.45, 0.35), col(k0 * 1.05)
        else:               # inkeping tussen twee takken
            ro, zo = r * rnd.uniform(0.46, 0.6), z + h * 0.14
            ri, zi = r * 0.30, z + h * 0.52
            co, ci = col(k0 * 0.62), col(k0 * 0.8)
        inner.append(vert((cx * 0.5 + ca * ri, cy * 0.5 + sa * ri, zi), ci))
        outer.append(vert((ca * ro, sa * ro, zo), co))
    under = vert((cx * 0.3, cy * 0.3, z + h * 0.1), col(k0 * 0.35))
    m = len(inner)
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((top, inner[k], inner[k2]))
        bm.faces.new((inner[k], outer[k], outer[k2], inner[k2]))
        bm.faces.new((outer[k2], outer[k], under))


def build_pine():
    reset_scene()
    rnd = random.Random(1234)
    # stam: oorsprong aan de voet, wortelvoet + takstompjes
    trunk_parts = [loft([((0, 0, -0.1), 0.40, 0.38), ((0, 0, 0.18), 0.30, 0.29), ((0.01, 0, 0.8), 0.25, 0.245),
                         ((0.02, 0.01, 3.0), 0.205, 0.20), ((0.0, 0.02, 6.0), 0.13, 0.13), ((-0.02, 0.0, 9.0), 0.06, 0.06),
                         ((0, 0, 9.7), 0.025, 0.025)],
                        M['bark'], n=8, caps=(False, True), angle=70, vscale=0.45)]
    for i in range(5):
        ang = rnd.uniform(0, 6.28)
        zz = 1.0 + i * 0.32
        d = Vector((math.cos(ang), math.sin(ang), -0.25))
        st = Vector((0, 0, zz)) + d * 0.15
        trunk_parts.append(limb(st, st + d * rnd.uniform(0.35, 0.6), [(0, 0.035, 0.035), (1, 0.008, 0.008)], M['bark'], n=4))
    trunk = join(trunk_parts, 'trunk')

    bm = bmesh.new()
    cols = []
    n = 16
    for i in range(n):
        t = i / (n - 1)
        r = 2.45 * (1 - t) ** 1.05 + 0.32
        z = 1.75 + (t ** 0.97) * 7.5
        hgt = 1.45 - t * 0.65
        nb = int(round(11 - 5 * t))
        bright = 0.78 + 0.32 * t
        pine_tier(bm, cols, z, hgt, r, nb, rnd, bright, tipdroop=1.0 - 0.4 * t)
    # top: twee kleine kransen + topscheut
    pine_tier(bm, cols, 9.45, 0.7, 0.28, 5, rnd, 1.15, 0.6)
    pine_tier(bm, cols, 9.9, 0.55, 0.16, 4, rnd, 1.2, 0.4)
    me = bpy.data.meshes.new('foliage')
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols):
        attr.data[i].color = (c[0], c[1], c[2], 1.0)
    me.color_attributes.active_color = attr
    fo = bpy.data.objects.new('foliage', me)
    bpy.context.scene.collection.objects.link(fo)
    foliage = finish(fo, M['needles'], smooth=True, angle=75)
    export('pine.glb', [trunk, foliage])


def build_rock():
    reset_scene()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.6, location=(0, 0, 0))
    r = bpy.context.active_object
    jitter_mesh(r, 0.09, 99)
    for v in r.data.vertices:          # afgeplatte facetten (breukvlakken) en iets ingegraven onderkant
        if v.co.z > 0.35:
            v.co.z = 0.35 + (v.co.z - 0.35) * 0.4
        if v.co.x > 0.42:
            v.co.x = 0.42 + (v.co.x - 0.42) * 0.3
    r.location = (0, 0, 0.12)
    r.scale = (1.3, 1.0, 0.7)
    bpy.context.view_layer.objects.active = r
    r.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    r.select_set(False)
    finish(r, M['rock'])
    r.name = r.data.name = 'rock'
    export('rock.glb', [r])


# ONLY=tower (komma-gescheiden) bouwt alleen die modellen opnieuw.
_only = [s.strip() for s in os.environ.get('ONLY', '').split(',') if s.strip()]
for _name, _fn in (('soldier', build_soldier), ('rifle', build_rifle), ('shotgun', build_shotgun),
                   ('sandbags', build_sandbags), ('crate', build_crate), ('tower', build_tower),
                   ('pine', build_pine), ('rock', build_rock)):
    if not _only or _name in _only:
        _fn()
print('KLAAR')
