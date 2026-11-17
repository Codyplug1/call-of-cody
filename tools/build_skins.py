"""
Bouwt de extra skin-modellen en camo-texturen met Blender.

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/build_skins.py

Resultaat:
  public/models/shellninja.glb   Schaduwschild (origineel ontwerp: schildpadachtige ninja)
  public/models/heavy.glb        Pantser (zwaar bepantserde soldaat)
  public/models/scout.glb        Jungleverkenner (boonie-hoed, tijgerstreep)
  public/models/ghillie.glb      Sluipschutter (ghillie-pak met plukken)
  public/models/skins/camo_*.jpg camo voor de soldaat-varianten (game.js zet die op materiaal 'Camo')

Dit script gebruikt NIET tools/build_models.py (dat bouwt de soldaat, wapens en props);
de hulpfuncties zijn hieronder gekopieerd.

Contract met public/game.js (gelijk aan soldier.glb):
  knooppunten 'legL' / 'legR' (draaipunt = heup op (+-0.14, 0, 0.9)) en 'body';
  materiaal 'Tint' = teamkleur. Voeten op z=0, kijkt naar -Y (= +Z in de game), ~1.9 m hoog.
  Armen in dezelfde schiethouding als de soldaat: rechterhand op (0.13, -0.355, 1.225)
  (pistoolgreep van het geweer), linkerhand op (0.085, -0.63, 1.245).
"""
import math
import os
import random

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
SKIN_OUT = os.path.join(OUT, 'skins')
os.makedirs(SKIN_OUT, exist_ok=True)
random.seed(11)
np.random.seed(11)


# ---------------------------------------------------------------- basis (gekopieerd uit build_models.py)

_mats = {}


def reset_all():
    """Alles weg, ook materialen en afbeeldingen: elk model krijgt zijn eigen 'Camo', 'Tint', ..."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    _mats.clear()


def make_image(name, rgb):
    """rgb: numpy array (h, w, 3) met waarden 0..1 (sRGB) -> verpakte Blender-afbeelding."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def material(name, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0, image=None, emit=None):
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
    if emit is not None:
        for key in ('Emission Color', 'Emission'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*emit[0], 1.0)
                break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emit[1]
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    _mats[name] = m
    return m


# box-projectie-UV's (herhalingen per meter), zelfde schaal als de soldaat
TEX_UV = {'Camo': 1.45}


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


def finish(o, mat, bevel=0.0, smooth=False, segs=2, harden=False, angle=50, flat=False):
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
    if flat:
        bpy.ops.object.shade_flat()
    elif smooth and not harden:
        shade_by_angle(angle)
    o.select_set(False)
    return o


def box(size, loc, mat, bevel=0.012, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, bevel, segs=1 if bevel <= 0.005 else 2)


def rbox(size, loc, mat, r=0.015, rot=(0, 0, 0), segs=1):
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


def ball(r, loc, mat, scale=(1, 1, 1), seg=8, rings=6, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    return finish(o, mat, smooth=True, angle=80)


def segment(p1, p2, thick, mat, bevel=0.02, thick2=None):
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
         smooth=True, angle=50, vscale=1.0, flat=False):
    """Buis door doorsneden. sections: (centrum, rx, ry[, exponent[, U, V]])."""
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
    return finish(o, mat, smooth=smooth, angle=angle, flat=flat)


def perp_frame(d):
    """Twee assen loodrecht op richting d (U zo veel mogelijk langs X)."""
    d = Vector(d).normalized()
    X = Vector((1, 0, 0))
    U = X - d * X.dot(d)
    if U.length < 1e-3:
        U = Vector((0, 1, 0)) - d * d.y
    U.normalize()
    V = d.cross(U).normalized()
    return U, V


def limb(p1, p2, prof, mat, n=10, e=1.0, angle=60):
    """Ledemaat van p1 naar p2; prof: (t, rx, ry), t=0 bij p1, t=1 bij p2."""
    a, b = Vector(p1), Vector(p2)
    U, V = perp_frame(b - a)
    secs = [(a + (b - a) * t, rx, ry, None, U, V) for (t, rx, ry) in prof]
    return loft(secs, mat, n=n, e=e, angle=angle)


def ring(c, axis, rx, ry, h, mat, tilt=0.0, n=12, bulge=1.05):
    """Korte band (omwikkeling) rond as 'axis' door c, met kanteling 'tilt' (rad)."""
    c = Vector(c)
    U, V = perp_frame(axis)
    ax = Vector(axis).normalized()
    if tilt:
        ax = (Matrix.Rotation(tilt, 3, U) @ ax).normalized()
        V = ax.cross(U).normalized()
    secs = [(c - ax * h / 2, rx, ry, None, U, V), (c, rx * bulge, ry * bulge, None, U, V), (c + ax * h / 2, rx, ry, None, U, V)]
    return loft(secs, mat, n=n, caps=(False, False), angle=70)


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


def export(filename, objs, uv=True):
    """uv=False: geen texcoords (model zonder texturen -> ~25% kleiner bestand)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    path = os.path.join(OUT, filename)
    base = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    if not uv:
        base['export_texcoords'] = False
    tries = [
        dict(export_vertex_color='MATERIAL', export_image_format='JPEG', export_jpeg_quality=82),
        dict(export_image_format='JPEG', export_jpeg_quality=82),
        dict(export_image_format='JPEG'),
        dict(),
    ]
    for extra in tries:
        try:
            bpy.ops.export_scene.gltf(**base, **extra)
            break
        except TypeError:
            continue
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')
    mats = sorted({m.name for o in objs for m in o.data.materials if m})
    print('Geexporteerd:', path, round(os.path.getsize(path) / 1024), 'KB', tris, 'tris', mats)


def interp_sections(secs, z):
    """Lineaire interpolatie van (centrum, rx, ry) in een lijst doorsneden (aflopende z)."""
    for a, b in zip(secs, secs[1:]):
        za, zb = a[0][2], b[0][2]
        if min(za, zb) <= z <= max(za, zb):
            t = (z - za) / (zb - za) if zb != za else 0
            c = Vector(a[0]).lerp(Vector(b[0]), t)
            return c, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
    s = secs[0] if abs(z - secs[0][0][2]) < abs(z - secs[-1][0][2]) else secs[-1]
    return Vector(s[0]), s[1], s[2]


def prof_at(prof, t):
    for a, b in zip(prof, prof[1:]):
        if a[0] <= t <= b[0]:
            k = (t - a[0]) / (b[0] - a[0])
            return a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k
    return prof[-1][1], prof[-1][2]


# ---------------------------------------------------------------- texturen (zelf gegenereerd, sRGB 0..1)

def tile_noise(size, freqs, seed, wave=np.sin, aniso=None):
    """Naadloos herhalende ruis (som van golven met gehele frequenties)."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / size * 2 * math.pi
    f = np.zeros((size, size))
    for k in freqs:
        for _ in range(3):
            if aniso:
                ax = rng.integers(-aniso[0], aniso[0] + 1)
                ay = rng.integers(aniso[1], aniso[2] + 1) * rng.choice([-1, 1])
            else:
                ax, ay = rng.integers(-k, k + 1, size=2)
                if ax == 0 and ay == 0:
                    ax = k
            f += wave(ax * x + ay * y + rng.uniform(0, 6.28)) / k
    return (f - f.min()) / (f.max() - f.min())


def tri_wave(t):
    """Driehoeksgolf (periode 2 pi): geeft hoekige vlekken (stadscamo)."""
    return 2 * np.abs((t / (2 * math.pi)) % 1.0 - 0.5) * 2 - 1


def fabric(img, seed, amount=0.05):
    s = img.shape[0]
    y, x = np.mgrid[0:s, 0:s]
    weave = (((x + y) % 3) == 0)[:, :, None] * 0.025
    grain = np.random.default_rng(seed).random((s, s, 1)) * amount - amount / 2
    return img * (1 - weave) + grain


def layered(s, base, layers, seed, wave=np.sin):
    img = np.tile(np.array(base, dtype=float), (s, s, 1))
    for i, (freqs, thr, col) in enumerate(layers):
        n = tile_noise(s, freqs, seed + 17 * i, wave=wave)
        img[n > thr] = col
    return img


def camo_woodland(s=128):
    """Zelfde bosprint als de soldaat (kleiner, voor het ghillie-pak)."""
    return layered(s, (0.50, 0.47, 0.33), [([3, 5, 8, 12], 0.52, (0.30, 0.34, 0.19)),
                                           ([4, 6, 10, 15], 0.62, (0.33, 0.24, 0.15)),
                                           ([5, 8, 12, 18], 0.72, (0.10, 0.12, 0.09))], 11)


def camo_desert(s=256):
    return fabric(layered(s, (0.80, 0.70, 0.52), [([3, 5, 8], 0.55, (0.66, 0.53, 0.37)),
                                                  ([4, 7, 11], 0.66, (0.50, 0.39, 0.27)),
                                                  ([6, 9, 14], 0.80, (0.90, 0.83, 0.68))], 101), 201)


def camo_arctic(s=256):
    return fabric(layered(s, (0.90, 0.92, 0.94), [([3, 6, 9], 0.58, (0.70, 0.74, 0.79)),
                                                  ([5, 9, 14], 0.73, (0.43, 0.47, 0.52))], 303), 202, 0.04)


def camo_urban(s=256):
    return fabric(layered(s, (0.56, 0.57, 0.58), [([2, 4, 7], 0.55, (0.34, 0.35, 0.37)),
                                                  ([3, 5, 9], 0.66, (0.14, 0.14, 0.15)),
                                                  ([4, 7, 11], 0.74, (0.80, 0.80, 0.80))], 404, wave=tri_wave), 203)


def camo_night(s=256):
    return fabric(layered(s, (0.15, 0.16, 0.18), [([3, 5, 8], 0.55, (0.22, 0.23, 0.26)),
                                                  ([5, 8, 12], 0.68, (0.08, 0.085, 0.10))], 505), 204, 0.035)


def camo_digital(s=256, cell=8):
    """Pixelcamo (blauwgrijs): grof raster van 8 px en fijn raster van 4 px."""
    n = s // cell
    img = layered(n, (0.36, 0.42, 0.52), [([2, 3, 5], 0.52, (0.22, 0.27, 0.36)),
                                          ([3, 4, 6], 0.64, (0.55, 0.60, 0.67))], 606)
    img = img.repeat(cell, 0).repeat(cell, 1)
    fine = tile_noise(n * 2, [3, 5, 8], 616) > 0.72
    fine = fine.repeat(cell // 2, 0).repeat(cell // 2, 1)
    img[fine] = (0.12, 0.15, 0.21)
    return fabric(img, 205, 0.03)


def camo_tiger(s=256):
    """Tijgerstreep: lange horizontale gebroken strepen (horizontaal op het lichaam)."""
    y, x = np.mgrid[0:s, 0:s] / s
    warp = tile_noise(s, [1, 2, 3], 707) * 1.4 + tile_noise(s, [4, 6], 708) * 0.3
    br1 = tile_noise(s, [3, 5, 8], 709, aniso=(2, 3, 9))
    br2 = tile_noise(s, [3, 5, 8], 710, aniso=(2, 3, 9))
    img = np.tile(np.array((0.52, 0.53, 0.34)), (s, s, 1))
    f1 = np.sin(2 * math.pi * (6 * y + warp))
    img[(f1 > 0.30) & (br1 > 0.32)] = (0.26, 0.30, 0.16)
    f2 = np.sin(2 * math.pi * (6 * y + warp + 0.10))
    img[(f2 > 0.72) & (br2 > 0.42)] = (0.08, 0.09, 0.07)
    return fabric(img, 206)


def save_jpg(name, rgb, quality=86):
    img = make_image(name, rgb)
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0
        scene.view_settings.gamma = 1
    except Exception:
        pass
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = quality
    path = os.path.join(SKIN_OUT, name + '.jpg')
    img.save_render(path, scene=scene)
    print('Textuur:', path, round(os.path.getsize(path) / 1024), 'KB')


# ---------------------------------------------------------------- soldaat-maten (gelijk aan build_models.py)

RS, RE, RH = Vector((0.27, -0.01, 1.47)), Vector((0.32, -0.15, 1.2)), Vector((0.13, -0.355, 1.225))
LS, LE, LH = Vector((-0.25, -0.04, 1.47)), Vector((-0.17, -0.34, 1.19)), Vector((0.085, -0.63, 1.245))
UPPER = [(-0.08, 0.050, 0.050), (0.05, 0.070, 0.068), (0.45, 0.062, 0.058), (0.9, 0.054, 0.050), (1.06, 0.045, 0.045)]
FORE = [(-0.06, 0.046, 0.046), (0.08, 0.055, 0.052), (0.55, 0.048, 0.044), (0.88, 0.040, 0.036), (0.95, 0.042, 0.038)]
GLOVE = [(0, 0.044, 0.042), (0.18, 0.046, 0.044), (0.3, 0.040, 0.034), (0.65, 0.048, 0.034),
         (0.92, 0.042, 0.032), (1.0, 0.030, 0.024)]

HC = Vector((0, 0.008, 1.772))      # helmcentrum
HR = (0.150, 0.172, 0.150)          # helmstralen


def helm_phi_min(a):
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
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    lo, hi = [], []
    for k in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * k / n)
        lo.append(bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z0)))
        hi.append(bm.verts.new((cx + rx * math.cos(a), cy + ry * math.sin(a), z1)))
    for k in range(n):
        bm.faces.new((lo[k], lo[k + 1], hi[k + 1], hi[k]))
    o = mesh_object(bm, 'band')
    return finish(o, mat, smooth=True, angle=80)


# ================================================================ SCHADUWSCHILD (shellninja)
# Origineel ontwerp: schildpadachtige humanoide in een zwart ninjapak met kap,
# omwikkelde armen/benen, tabi-laarzen (gesplitste teen), een hoekig rugschild
# met zeshoekige platen (gedragen als tactisch 'schild-pakket' met riemen),
# snavelkop met kleine amberkleurige ogen in een spleet van de kap.
# Teamkleur: sjerp, armband en een kielstreep over het schild.

LEG_SECS = lambda sx, x: [((sx * 0.112, 0.0, 0.99), 0.100, 0.120),
                          ((sx * 0.118, -0.004, 0.88), 0.106, 0.122),
                          ((sx * 0.125, -0.010, 0.72), 0.096, 0.106),
                          ((sx * 0.131, -0.012, 0.57), 0.080, 0.090),
                          ((sx * 0.134, -0.008, 0.48), 0.072, 0.082),
                          ((sx * 0.137, 0.004, 0.40), 0.063, 0.074),
                          ((sx * 0.140, 0.012, 0.28), 0.054, 0.064),
                          ((sx * 0.140, 0.014, 0.17), 0.049, 0.057),
                          ((x, 0.016, 0.12), 0.050, 0.058)]

# rugschild: superellips-koepel. Basis wikkelt om de flanken (basis-y loopt terug naar de zijkant).
SH_CZ, SH_RX, SH_RY, SH_RZ, SH_E = 1.285, 0.238, 0.205, 0.325, 0.8


def sh_base_y(x):
    return 0.105 - 0.11 * (x / SH_RX) ** 2


def sh_rho(x, z):
    return ((abs(x) / SH_RX) ** (2 / SH_E) + (abs(z - SH_CZ) / SH_RZ) ** (2 / SH_E)) ** (SH_E / 2)


def sh_point(x, z, lift=0.0):
    r = min(sh_rho(x, z), 1.0)
    y = sh_base_y(x) + SH_RY * math.sqrt(max(0.0, 1 - r * r)) ** 0.85
    p = Vector((x, y, z))
    if lift:
        p += sh_normal(x, z) * lift
    return p


def sh_normal(x, z):
    e = 0.004
    px1, px0 = sh_point(x + e, z), sh_point(x - e, z)
    pz1, pz0 = sh_point(x, z + e), sh_point(x, z - e)
    n = (pz1 - pz0).cross(px1 - px0)
    if n.y < 0:
        n = -n
    return n.normalized()


def sh_outline(theta, rho):
    c, s = math.cos(theta), math.sin(theta)
    x = math.copysign(abs(c) ** SH_E, c) * SH_RX * rho
    z = SH_CZ + math.copysign(abs(s) ** SH_E, s) * SH_RZ * rho
    return x, z


def carapace_dome(mat):
    """Hoekige koepel (vlakke facetten)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    n = 18
    rhos = [1.0, 0.93, 0.8, 0.62, 0.4, 0.0]
    rows = []
    for rho in rhos[:-1]:
        row = []
        for k in range(n):
            x, z = sh_outline(2 * math.pi * k / n, rho)
            row.append(bm.verts.new(sh_point(x, z)))
        rows.append(row)
    apex = bm.verts.new(sh_point(0, SH_CZ))
    for i in range(len(rows) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rows[i][k], rows[i][k2], rows[i + 1][k2], rows[i + 1][k]))
    for k in range(n):
        bm.faces.new((rows[-1][k], rows[-1][(k + 1) % n], apex))
    # onderkant dicht (vlak tegen de rug)
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(bm, 'dome')
    return finish(o, mat, flat=True)


def hex_plate(bm, x, z, r, top_lift=0.022, apex_lift=0.031, rot=0.0):
    """Zeshoekige plaat op het schild: prisma met licht piramidevormige bovenkant."""
    N = sh_normal(x, z)
    P = sh_point(x, z)
    U = Vector((1, 0, 0)) - N * N.x
    U.normalize()
    V = N.cross(U).normalized()
    bot, top = [], []
    for k in range(6):
        a = rot + k * math.pi / 3
        d = U * (math.cos(a) * r) + V * (math.sin(a) * r)
        # punt op het oppervlak onder deze hoek (volgt de kromming)
        q = sh_point(P.x + d.x, P.z + d.z)
        bot.append(bm.verts.new(q - N * 0.012))
        top.append(bm.verts.new(q + N * top_lift))
    apex = bm.verts.new(P + N * apex_lift)
    for k in range(6):
        k2 = (k + 1) % 6
        bm.faces.new((bot[k], bot[k2], top[k2], top[k]))
        bm.faces.new((top[k], top[k2], apex))


def carapace(M):
    parts = [carapace_dome(M['shell'])]
    # zeshoekige platen (twee tinten), middenbaan vrij voor de kielstreep
    bmA, bmB = bmesh.new(), bmesh.new()
    r = 0.056
    colx = [0.068, 0.152, 0.236]
    for ci, cx in enumerate(colx):
        for side in (-1, 1):
            off = 0.0 if ci % 2 == 0 else 0.5
            for j in range(-4, 5):
                z = SH_CZ + (j + off) * 0.098
                x = side * cx
                rho = sh_rho(x, z)
                if rho > 0.80:
                    continue
                target = bmA if (j + ci) % 2 == 0 else bmB
                hex_plate(target, x, z, r * (1.0 - 0.18 * rho), rot=0.0)
    for bmx, key in ((bmA, 'plate'), (bmB, 'plate2')):
        bmesh.ops.recalc_face_normals(bmx, faces=bmx.faces)
        parts.append(finish(mesh_object(bmx, 'plates'), M[key], flat=True))
    # randplaten (rondom, afwisselend van tint, met kleine naden)
    n = 22
    bmA, bmB = bmesh.new(), bmesh.new()
    for k in range(n):
        target = bmA if k % 2 == 0 else bmB
        th0 = 2 * math.pi * (k + 0.06) / n
        th1 = 2 * math.pi * (k + 0.94) / n
        pts = []
        for th in (th0, th1):
            for rho in (1.0, 0.86):
                x, z = sh_outline(th, rho)
                pts.append((sh_point(x, z), sh_normal(x, z)))
        (p00, n00), (p01, n01), (p10, n10), (p11, n11) = pts
        lo = [p00 - n00 * 0.01, p10 - n10 * 0.01, p11 - n11 * 0.01, p01 - n01 * 0.01]
        hi = [p00 + n00 * 0.016, p10 + n10 * 0.016, p11 + n11 * 0.024, p01 + n01 * 0.024]
        lv = [target.verts.new(p) for p in lo]
        hv = [target.verts.new(p) for p in hi]
        target.faces.new(hv)
        for i in range(4):
            i2 = (i + 1) % 4
            target.faces.new((lv[i], lv[i2], hv[i2], hv[i]))
    for bmx, key in ((bmA, 'rim'), (bmB, 'plate2')):
        bmesh.ops.recalc_face_normals(bmx, faces=bmx.faces)
        parts.append(finish(mesh_object(bmx, 'rim'), M[key], flat=True))
    # kielstreep in teamkleur over het midden
    secs = []
    zs = [SH_CZ - SH_RZ * 0.84 + i * (SH_RZ * 1.68) / 14 for i in range(15)]
    for z in zs:
        N = sh_normal(0, z)
        p = sh_point(0, z) + N * 0.012
        secs.append((p, 0.017, 0.013, 0.6, (1, 0, 0), tuple(N)))
    parts.append(loft(secs, M['tint'], n=8, angle=40))
    return parts


def build_shellninja():
    reset_all()
    M = {
        'suit': material('NinjaSuit', (0.018, 0.018, 0.021), 0.82),
        'wrap': material('Wrap', (0.042, 0.041, 0.040), 0.92),
        'boot': material('Tabi', (0.013, 0.013, 0.015), 0.65),
        'sole': material('Sole', (0.07, 0.07, 0.07), 0.9),
        'strap': material('Strap', (0.050, 0.042, 0.032), 0.7),
        'metal': material('Metal', (0.30, 0.31, 0.30), 0.45, 0.7),
        'shell': material('Carapace', (0.016, 0.018, 0.014), 0.7),
        'plate': material('ShellPlate', (0.115, 0.13, 0.085), 0.55),
        'plate2': material('ShellPlateDark', (0.045, 0.052, 0.036), 0.6),
        'rim': material('ShellRim', (0.075, 0.085, 0.06), 0.6),
        'skin': material('ReptileSkin', (0.16, 0.20, 0.11), 0.6),
        'beak': material('Beak', (0.10, 0.10, 0.075), 0.4),
        'eye': material('Eye', (0.95, 0.42, 0.04), 0.25, emit=((1.0, 0.45, 0.05), 0.8)),
        'pupil': material('Pupil', (0.005, 0.005, 0.005), 0.3),
        'tint': material('Tint', (0.8, 0.1, 0.1), 0.6),
    }

    # ------------------------------------------------ benen
    def leg(side):
        x = 0.14 * side
        sx = side
        secs = LEG_SECS(sx, x)
        objs = [loft(secs, M['suit'], n=12, caps=(False, True), angle=60)]
        # omwikkeling van de scheen (licht schuin, afwisselend)
        for i in range(7):
            z = 0.15 + i * 0.042
            c, rx, ry = interp_sections(secs, z)
            objs.append(ring(c, (0, 0, 1), rx + 0.006, ry + 0.006, 0.034, M['wrap'], tilt=0.16 if i % 2 else -0.16))
        # wikkel boven de knie
        c, rx, ry = interp_sections(secs, 0.60)
        objs.append(ring(c, (0, 0, 1), rx + 0.004, ry + 0.004, 0.03, M['wrap'], tilt=0.1))
        # tabi-laars: schacht, voet, grote teen los van de andere tenen, zool
        inner = -side
        bx = x + inner * 0.040
        ox = x + side * 0.014
        objs += [
            loft([((x, 0.018, 0.045), 0.060, 0.068), ((x, 0.018, 0.10), 0.056, 0.064),
                  ((x, 0.016, 0.15), 0.052, 0.060)], M['boot'], n=12, e=0.9),
            loft([((x, 0.088, 0.050), 0.044, 0.038), ((x, 0.072, 0.064), 0.058, 0.058),
                  ((x, 0.010, 0.068), 0.062, 0.062), ((x, -0.070, 0.050), 0.062, 0.046),
                  ((x, -0.118, 0.038), 0.058, 0.034)], M['boot'], n=12, e=0.65, u=(1, 0, 0), v=(0, 0, 1)),
            loft([((bx, -0.105, 0.036), 0.019, 0.030), ((bx, -0.160, 0.033), 0.020, 0.027),
                  ((bx, -0.188, 0.027), 0.014, 0.019)], M['boot'], n=10, e=0.7, u=(1, 0, 0), v=(0, 0, 1)),
            loft([((ox, -0.105, 0.034), 0.037, 0.028), ((ox, -0.152, 0.030), 0.035, 0.024),
                  ((ox, -0.174, 0.024), 0.026, 0.016)], M['boot'], n=10, e=0.7, u=(1, 0, 0), v=(0, 0, 1)),
            loft([((x, 0.092, 0.008), 0.048, 0.008), ((x, 0.030, 0.008), 0.062, 0.008),
                  ((x, -0.100, 0.008), 0.066, 0.008), ((x, -0.170, 0.009), 0.060, 0.009),
                  ((x, -0.196, 0.010), 0.044, 0.008)], M['sole'], n=10, e=0.4, u=(1, 0, 0), v=(0, 0, 1)),
            ring((x, 0.016, 0.135), (0, 0, 1), 0.056, 0.064, 0.03, M['wrap'], tilt=0.12),
        ]
        return join(objs, 'legL' if side < 0 else 'legR', origin=(x, 0, 0.9))

    legL = leg(-1)
    legR = leg(1)

    body = []
    # ------------------------------------------------ romp
    body.append(loft([((0, 0.0, 0.84), 0.150, 0.100), ((0, 0.0, 0.90), 0.185, 0.120),
                      ((0, 0.0, 1.00), 0.190, 0.125), ((0, 0.0, 1.06), 0.180, 0.120)],
                     M['suit'], n=16, e=0.85))
    body.append(loft([((0, 0.0, 1.02), 0.172, 0.117), ((0, 0.0, 1.15), 0.178, 0.122),
                      ((0, 0.0, 1.30), 0.204, 0.132), ((0, 0.0, 1.42), 0.218, 0.132),
                      ((0, 0.005, 1.50), 0.210, 0.122), ((0, 0.01, 1.56), 0.152, 0.102),
                      ((0, 0.01, 1.60), 0.075, 0.072)],
                     M['suit'], n=16, e=0.85))
    # overslag van de ninjajas (diagonale rand)
    fold = [(-0.115, -0.105, 1.565), (-0.06, -0.135, 1.46), (0.0, -0.140, 1.34), (0.06, -0.134, 1.22), (0.12, -0.12, 1.08)]
    for p, q in zip(fold, fold[1:]):
        body.append(segment(p, q, 0.034, M['wrap'], 0.006, thick2=0.012))
    # sjerp (teamkleur) met knoop op de heup
    body.append(loft([((0, 0.0, 0.985), 0.196, 0.132), ((0, 0.0, 1.025), 0.203, 0.138),
                      ((0, 0.0, 1.068), 0.192, 0.130)], M['tint'], n=16, e=0.75, caps=(False, False)))
    body.append(ball(0.034, (-0.168, -0.092, 1.03), M['tint'], scale=(1.0, 0.75, 0.9)))
    body.append(rbox((0.042, 0.014, 0.12), (-0.178, -0.098, 0.955), M['tint'], 0.006, rot=(0.1, 0.18, 0)))
    # tasje aan de sjerp (rechterheup, achter)
    body.append(rbox((0.07, 0.05, 0.075), (0.15, 0.10, 1.0), M['strap'], 0.014))
    # harnas van het schild-pakket: schouderriemen, borstriem met gesp, buikriem
    for sx in (-1, 1):
        pts = [(sx * 0.100, -0.136, 1.14), (sx * 0.100, -0.146, 1.30), (sx * 0.106, -0.144, 1.45),
               (sx * 0.112, -0.09, 1.565), (sx * 0.114, -0.02, 1.598), (sx * 0.114, 0.06, 1.59), (sx * 0.12, 0.14, 1.52)]
        for p, q in zip(pts, pts[1:]):
            body.append(segment(p, q, 0.05, M['strap'], 0.006, thick2=0.016))
    body.append(rbox((0.25, 0.016, 0.036), (0, -0.152, 1.40), M['strap'], 0.006))
    body.append(rbox((0.05, 0.022, 0.05), (0, -0.162, 1.40), M['metal'], 0.008))
    body.append(loft([((0, 0.0, 1.115), 0.186, 0.128), ((0, 0.0, 1.16), 0.188, 0.130)],
                     M['strap'], n=16, e=0.7, caps=(False, False)))
    body.append(rbox((0.045, 0.02, 0.04), (0, -0.136, 1.137), M['metal'], 0.007))
    # rugschild
    body += carapace(M)

    # ------------------------------------------------ hoofd: snavelkop in een kap met kijkspleet
    body.append(cyl(0.058, 0.1, (0, 0.0, 1.6), M['skin'], verts=12))
    body.append(loft([((0, 0.085, 1.745), 0.045, 0.055), ((0, 0.06, 1.75), 0.080, 0.092),
                      ((0, 0.02, 1.752), 0.094, 0.104), ((0, -0.03, 1.748), 0.092, 0.100),
                      ((0, -0.07, 1.738), 0.080, 0.082), ((0, -0.10, 1.728), 0.064, 0.060),
                      ((0, -0.125, 1.720), 0.046, 0.042), ((0, -0.14, 1.715), 0.028, 0.026)],
                     M['skin'], n=14, u=(1, 0, 0), v=(0, 0, 1)))
    # hoornsnavel (bovensnavel met haakpunt) en ondersnavel
    body.append(loft([((0, -0.106, 1.729), 0.056, 0.042), ((0, -0.127, 1.725), 0.046, 0.038),
                      ((0, -0.146, 1.717), 0.033, 0.030), ((0, -0.160, 1.706), 0.019, 0.021),
                      ((0, -0.167, 1.692), 0.007, 0.009)], M['beak'], n=12, e=0.85, u=(1, 0, 0), v=(0, 0, 1)))
    body.append(loft([((0, -0.088, 1.692), 0.052, 0.020), ((0, -0.122, 1.694), 0.036, 0.016),
                      ((0, -0.142, 1.697), 0.018, 0.010)], M['beak'], n=10, u=(1, 0, 0), v=(0, 0, 1)))
    for sx in (-1, 1):
        ec = Vector((sx * 0.056, -0.090, 1.762))
        body.append(ball(0.0185, ec, M['eye'], seg=10, rings=8))
        look = Vector((sx * 0.62, -0.78, 0.05)).normalized()
        body.append(rbox((0.005, 0.004, 0.017), ec + look * 0.017, M['pupil'], 0.001,
                         rot=(0, 0, math.atan2(look.x, -look.y))))
        # wenkbrauwrichel (schubbig, iets donkerder door de schaduw van de kap)
        body.append(rbox((0.042, 0.022, 0.013), (sx * 0.05, -0.088, 1.786), M['skin'], 0.005,
                         rot=(0.25, sx * -0.2, sx * 0.45)))
        # neusgat
        body.append(ball(0.004, (sx * 0.012, -0.156, 1.724), M['pupil'], seg=6, rings=4))
    # nekwikkel (bedekt kin en hals)
    body.append(loft([((0, 0.0, 1.55), 0.086, 0.086), ((0, -0.008, 1.62), 0.093, 0.105),
                      ((0, -0.012, 1.665), 0.095, 0.111), ((0, -0.012, 1.694), 0.093, 0.109)],
                     M['suit'], n=14, caps=(False, False)))
    body.append(ring((0, -0.012, 1.69), (0, 0, 1), 0.095, 0.111, 0.014, M['wrap']))

    # kap: ellipsoide die aan de achterkant/zijkant tot de nek loopt; voor een spleet op ooghoogte
    cx, cy, cz = 0.0, -0.005, 1.748
    RX, RY, RZt, ZN = 0.107, 0.123, 0.132, 1.58

    def edge_z(a):
        da = abs(((math.degrees(a) + 90 + 180) % 360) - 180)  # 0 = recht vooruit
        w = 1.0 if da < 48 else 0.0 if da > 68 else 1 - (da - 48) / 20
        w = w * w * (3 - 2 * w)
        return 1.60 + (1.792 - 1.60) * w

    def hood_pt(phi, a, s=1.0):
        if phi >= 0:
            z = cz + RZt * math.sin(phi)
            k = math.cos(phi)
        else:
            f = -phi / (math.pi / 2)
            z = cz - (cz - ZN) * f
            k = 1 - 0.24 * f ** 1.3
        return Vector((cx + RX * k * math.cos(a) * s, cy + RY * k * math.sin(a) * s, z))

    def phi_of(z):
        if z >= cz:
            return math.asin(min(1.0, (z - cz) / RZt))
        return -(cz - z) / (cz - ZN) * (math.pi / 2)

    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    n, rows = 28, 8
    grid = []
    for i in range(rows + 1):
        row = []
        for k in range(n):
            a = 2 * math.pi * k / n
            p0 = phi_of(edge_z(a))
            t = i / rows
            phi = p0 + (math.pi / 2 - p0) * (1 - (1 - t) ** 1.2)
            row.append(bm.verts.new(hood_pt(min(phi, math.pi / 2 - 0.02), a)))
        grid.append(row)
    for i in range(rows):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((grid[i][k], grid[i][k2], grid[i + 1][k2], grid[i + 1][k]))
    top = bm.verts.new(hood_pt(math.pi / 2, 0))
    for k in range(n):
        bm.faces.new((grid[-1][k], grid[-1][(k + 1) % n], top))
    body.append(finish(mesh_object(bm, 'hood'), M['suit'], smooth=True, angle=70))
    # zoom langs de kijkspleet
    secs = []
    for k in range(0, 11):
        a = math.radians(-138 + k * 96 / 10)
        p = hood_pt(phi_of(edge_z(a)), a, 1.0)
        secs.append(p)
    for p, q in zip(secs, secs[1:]):
        body.append(limb(p, q, [(-0.15, 0.0065, 0.0065), (1.15, 0.0065, 0.0065)], M['wrap'], n=6))
    # knoop van de kap achter op het hoofd
    body.append(ball(0.024, (0, 0.118, 1.76), M['wrap'], scale=(1.2, 0.8, 0.9)))

    # ------------------------------------------------ armen in schiethouding (zelfde handposities)
    for s_, e_, h_, sx in ((RS, RE, RH, 1), (LS, LE, LH, -1)):
        d = (h_ - e_).normalized()
        wrist = h_ - d * 0.055
        body.append(limb(s_, e_, UPPER, M['suit'], n=10))
        body.append(limb(e_, wrist, FORE, M['suit'], n=10))
        body.append(ball(0.075, s_ + Vector((0, 0, 0.012)), M['suit'], scale=(1.0, 1.0, 0.95)))
        body.append(ball(0.062, e_ + (e_ - s_).normalized() * 0.01 + Vector((0, 0, -0.008)), M['wrap'], seg=10, rings=6))
        # omwikkelde onderarm
        L = (wrist - e_).length
        for i in range(6):
            t = 0.22 + i * 0.13
            rx, ry = prof_at(FORE, t)
            body.append(ring(e_.lerp(wrist, t), d, rx + 0.006, ry + 0.006, 0.03 / max(L, 0.01) * L, M['wrap'],
                             tilt=0.22 if i % 2 else -0.22, n=10))
        # schubbige hand (zelfde vorm als de handschoen van de soldaat) met polswikkel
        body.append(limb(wrist - d * 0.02, h_ + d * 0.06, GLOVE, M['skin'], n=10, e=0.8))
        body.append(ring(wrist + d * 0.004, d, 0.050, 0.048, 0.04, M['wrap'], n=10))
        side = Vector((0, 0, 1)).cross(d).normalized()
        body.append(limb(h_ - d * 0.015 + Vector((0, 0, 0.028)), h_ + d * 0.035 + Vector((0, 0, 0.034)) + side * 0.012,
                         [(0, 0.016, 0.016), (1, 0.013, 0.013), (1.15, 0.008, 0.008)], M['skin'], n=6))
        # kleine knokkelplaatjes
        body.append(rbox((0.05, 0.012, 0.02), h_ + d * 0.025 + Vector((0, 0, 0.036)), M['beak'], 0.004,
                         rot=(0, 0, math.atan2(d.x, -d.y))))
    # armband (teamkleur) om de linker bovenarm
    body.append(limb(LS.lerp(LE, 0.28), LS.lerp(LE, 0.42), [(0, 0.071, 0.068), (1, 0.068, 0.064)], M['tint'], n=10))

    torso = join(body, 'body', origin=(0, 0, 0))
    export('shellninja.glb', [legL, legR, torso], uv=False)


# ================================================================ soldaat-afgeleiden (heavy, scout, ghillie)

def tuft_blades(bm, base, normal, rnd, length, width, count=3):
    """Ghillie-pluk: bosje van platte hangende repen (basis, knik, punt).
    Plat (dubbelzijdig materiaal in glTF), zodat het bestand klein blijft."""
    n = Vector(normal).normalized()
    for _ in range(count):
        rv = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.4)))
        d = (n * 0.55 + Vector((0, 0, -1.0)) + rv * 0.45).normalized()
        s = d.cross(n)
        if s.length < 1e-3:
            s = Vector((1, 0, 0))
        s.normalize()
        L = length * rnd.uniform(0.7, 1.15)
        w = width * rnd.uniform(0.8, 1.25)
        b = Vector(base) - n * 0.01 + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.012
        m = b + d * (L * 0.5) + n * (L * 0.12)
        tip = b + (d + Vector((0, 0, -0.4))).normalized() * L + n * (L * 0.05)
        v = [bm.verts.new(b + s * w), bm.verts.new(b - s * w), bm.verts.new(m - s * w * 0.6),
             bm.verts.new(m + s * w * 0.6), bm.verts.new(tip)]
        bm.faces.new((v[0], v[1], v[2], v[3]))
        bm.faces.new((v[3], v[2], v[4]))


class Tufts:
    """Verzamelt plukken per materiaal en zet ze om in objecten."""

    def __init__(self, mats, seed):
        self.mats = mats
        self.bms = [bmesh.new() for _ in mats]
        self.rnd = random.Random(seed)

    def add(self, base, normal, length=None, width=None):
        r = self.rnd
        i = r.randrange(len(self.mats))
        tuft_blades(self.bms[i], base, normal, r,
                    length if length else r.uniform(0.09, 0.19), width if width else r.uniform(0.012, 0.022))

    def objects(self):
        out = []
        for bm, m in zip(self.bms, self.mats):
            if len(bm.verts) == 0:
                bm.free()
                continue
            out.append(finish(mesh_object(bm, 'tufts'), m, smooth=True, angle=89))
        return out


def trooper_materials(kind):
    # sleutel: (materiaalnaam, kleur, ruwheid, metaal)
    spec = {
        'vest': ('Vest', (0.24, 0.26, 0.17), 0.85, 0.0),
        'webbing': ('Webbing', (0.16, 0.17, 0.12), 0.9, 0.0),
        'scarf': ('Scarf', (0.20, 0.21, 0.14), 0.95, 0.0),
        'boot': ('Boot', (0.20, 0.15, 0.10), 0.75, 0.0),
        'sole': ('Sole', (0.05, 0.05, 0.045), 0.9, 0.0),
        'skin': ('Skin', (0.62, 0.45, 0.34), 0.7, 0.0),
        'glove': ('Glove', (0.12, 0.12, 0.11), 0.8, 0.0),
        'lens': ('Lens', (0.05, 0.06, 0.07), 0.15, 0.4),
        'tint': ('Tint', (0.8, 0.1, 0.1), 0.6, 0.0),
        'polymer': ('Polymer', (0.12, 0.12, 0.12), 0.7, 0.0),
        'metal': ('Metal', (0.30, 0.31, 0.30), 0.5, 0.7),
    }
    image = None
    if kind == 'heavy':
        spec['camo'] = ('Camo', (0.075, 0.078, 0.07), 0.9, 0.0)           # effen onderpak
        spec['armor'] = ('Armor', (0.105, 0.115, 0.085), 0.5, 0.35)
        spec['armordk'] = ('ArmorDark', (0.035, 0.037, 0.034), 0.6, 0.2)
        spec['glove'] = ('Glove', (0.05, 0.05, 0.048), 0.7, 0.0)
        spec['boot'] = ('Boot', (0.045, 0.042, 0.038), 0.7, 0.0)
        del spec['vest']
    elif kind == 'scout':
        image = make_image('tiger', camo_tiger(256))
        spec['scarf'] = ('Scarf', (0.42, 0.36, 0.24), 0.95, 0.0)
        spec['vest'] = ('Vest', (0.20, 0.22, 0.12), 0.85, 0.0)
        spec['boot'] = ('Boot', (0.30, 0.22, 0.13), 0.8, 0.0)
        spec['lens'] = ('Lens', (0.02, 0.025, 0.03), 0.08, 0.6)
    elif kind == 'ghillie':
        image = make_image('woodland', camo_woodland(128))
        spec['skin'] = ('Skin', (0.20, 0.21, 0.12), 0.75, 0.0)            # schmink
        spec['g1'] = ('GhillieDry', (0.30, 0.27, 0.13), 0.95, 0.0)
        spec['g2'] = ('GhillieOlive', (0.13, 0.17, 0.06), 0.95, 0.0)
        spec['g3'] = ('GhillieDark', (0.06, 0.08, 0.035), 0.95, 0.0)
        spec['g4'] = ('GhillieBrown', (0.17, 0.12, 0.06), 0.95, 0.0)
    M = {k: material(nm, col, rough, metal) for k, (nm, col, rough, metal) in spec.items()}
    if image is not None:
        M['camo'] = material('Camo', (1, 1, 1), 0.9, image=image)
    if kind == 'heavy':
        M['vest'] = M['armordk']
    return M


def build_trooper(kind):
    reset_all()
    M = trooper_materials(kind)
    tufts = Tufts([M['g1'], M['g2'], M['g3'], M['g4']], 77) if kind == 'ghillie' else None

    # ------------------------------------------------ benen
    def leg(side):
        x = 0.14 * side
        sx = side
        leg_tufts = Tufts([M['g1'], M['g2'], M['g3'], M['g4']], 90 + side) if kind == 'ghillie' else None
        objs = [
            loft([((sx * 0.112, 0.0, 0.99), 0.098, 0.118),
                  ((sx * 0.116, -0.004, 0.90), 0.100, 0.118),
                  ((sx * 0.123, -0.010, 0.75), 0.088, 0.100),
                  ((sx * 0.130, -0.012, 0.60), 0.072, 0.082),
                  ((sx * 0.133, -0.010, 0.51), 0.066, 0.076),
                  ((sx * 0.136, 0.002, 0.42), 0.066, 0.082),
                  ((sx * 0.140, 0.012, 0.30), 0.056, 0.066),
                  ((sx * 0.140, 0.016, 0.22), 0.064, 0.072),
                  ((sx * 0.140, 0.016, 0.19), 0.060, 0.068)],
                 M['camo'], n=12, caps=(False, True), angle=60),
            loft([((x, 0.018, 0.05), 0.066, 0.075), ((x, 0.018, 0.13), 0.064, 0.072),
                  ((x, 0.016, 0.215), 0.061, 0.069)], M['boot'], n=12, e=0.85),
            loft([((x, 0.090, 0.055), 0.048, 0.040),
                  ((x, 0.075, 0.068), 0.062, 0.062),
                  ((x, 0.010, 0.072), 0.066, 0.068),
                  ((x, -0.075, 0.055), 0.066, 0.052),
                  ((x, -0.150, 0.045), 0.060, 0.042),
                  ((x, -0.195, 0.040), 0.044, 0.030)],
                 M['boot'], n=12, e=0.6, u=(1, 0, 0), v=(0, 0, 1)),
            loft([((x, 0.095, 0.014), 0.054, 0.014),
                  ((x, 0.040, 0.014), 0.068, 0.014),
                  ((x, -0.100, 0.014), 0.071, 0.014),
                  ((x, -0.190, 0.016), 0.054, 0.016),
                  ((x, -0.212, 0.022), 0.034, 0.012)],
                 M['sole'], n=10, e=0.4, u=(1, 0, 0), v=(0, 0, 1)),
        ]
        if kind == 'heavy':
            # dijplaten, grote kniekap, scheenplaat
            objs.append(rbox((0.15, 0.04, 0.21), (sx * 0.12, -0.112, 0.77), M['armor'], 0.02, rot=(-0.07, 0, 0), segs=2))
            objs.append(rbox((0.04, 0.15, 0.2), (sx * 0.222, -0.005, 0.78), M['armor'], 0.02, segs=2))
            objs.append(ball(0.07, (sx * 0.134, -0.088, 0.505), M['armor'], scale=(1.0, 0.65, 1.1), seg=12, rings=8))
            objs.append(rbox((0.105, 0.035, 0.24), (sx * 0.138, -0.083, 0.33), M['armor'], 0.016, rot=(-0.06, 0, 0), segs=2))
            objs.append(rbox((0.11, 0.012, 0.03), (sx * 0.138, -0.103, 0.40), M['armordk'], 0.004, rot=(-0.06, 0, 0)))
            objs.append(rbox((0.13, 0.03, 0.05), (x, -0.11, 0.085), M['armordk'], 0.012))   # neusbeschermer laars
        else:
            objs.append(loft([((sx * 0.134, -0.072, 0.56), 0.050, 0.020),
                              ((sx * 0.134, -0.090, 0.505), 0.058, 0.026),
                              ((sx * 0.134, -0.074, 0.44), 0.048, 0.020)],
                             M['webbing'], n=10, u=(1, 0, 0), v=(0, 1, 0), e=0.7))
            if side < 0:
                objs.append(rbox((0.05, 0.15, 0.17), (x - 0.088, -0.01, 0.69), M['webbing'], 0.015))
                objs.append(rbox((0.056, 0.155, 0.045), (x - 0.09, -0.01, 0.765), M['vest'], 0.012))
            else:
                objs.append(rbox((0.04, 0.14, 0.15), (x + 0.088, -0.005, 0.70), M['camo'], 0.015))
        if leg_tufts:
            r = leg_tufts.rnd
            for _ in range(32):
                z = r.uniform(0.6, 0.98)
                a = r.uniform(0, 2 * math.pi)
                nrm = Vector((math.cos(a), math.sin(a) * 1.1, 0))
                p = Vector((sx * 0.12, -0.005, z)) + Vector((math.cos(a) * 0.105, math.sin(a) * 0.12, 0))
                leg_tufts.add(p, nrm, length=r.uniform(0.08, 0.16))
            objs += leg_tufts.objects()
        return join(objs, 'legL' if side < 0 else 'legR', origin=(x, 0, 0.9))

    legL = leg(-1)
    legR = leg(1)

    body = []
    # ------------------------------------------------ romp
    body.append(loft([((0, 0.0, 0.84), 0.150, 0.100), ((0, 0.0, 0.90), 0.185, 0.120),
                      ((0, 0.0, 1.00), 0.190, 0.125), ((0, 0.0, 1.06), 0.180, 0.120)],
                     M['camo'], n=16, e=0.85))
    body.append(loft([((0, 0.0, 1.02), 0.170, 0.115), ((0, 0.0, 1.15), 0.176, 0.120),
                      ((0, 0.0, 1.30), 0.200, 0.130), ((0, 0.0, 1.42), 0.214, 0.130),
                      ((0, 0.005, 1.50), 0.208, 0.120), ((0, 0.01, 1.56), 0.150, 0.100),
                      ((0, 0.01, 1.60), 0.075, 0.072)],
                     M['camo'], n=16, e=0.85))
    body.append(loft([((0, 0.0, 1.000), 0.197, 0.133), ((0, 0.0, 1.062), 0.197, 0.133)],
                     M['webbing'], n=16, e=0.7, smooth=True))
    body.append(rbox((0.06, 0.02, 0.045), (0, -0.135, 1.031), M['metal'], 0.006))

    if kind == 'ghillie':
        # lichte borstuitrusting (verdwijnt grotendeels onder de plukken)
        body.append(loft([((0, 0.0, 1.13), 0.200, 0.142), ((0, 0.0, 1.27), 0.204, 0.146)], M['vest'], n=16, e=0.6))
        for px in (-0.07, 0.07):
            body.append(rbox((0.084, 0.046, 0.115), (px, -0.17, 1.22), M['vest'], 0.012))
        # sluipschutter-sleeptas op de rug + teampatch
        body.append(rbox((0.26, 0.10, 0.30), (0, 0.22, 1.33), M['webbing'], 0.04, segs=2))
        body.append(rbox((0.13, 0.012, 0.075), (0, 0.274, 1.40), M['tint'], 0.006))
    elif kind == 'heavy':
        A, D = M['armor'], M['armordk']
        body.append(rbox((0.40, 0.075, 0.30), (0, -0.165, 1.40), A, 0.03, segs=3))         # borstplaat
        body.append(rbox((0.30, 0.012, 0.03), (0, -0.205, 1.47), M['tint'], 0.006))        # teamstreep
        for i in range(3):                                                                  # buikplaten
            body.append(rbox((0.31 - 0.03 * i, 0.055, 0.075), (0, -0.152 + 0.004 * i, 1.215 - 0.075 * i), A, 0.018, segs=2))
        body.append(rbox((0.42, 0.075, 0.42), (0, 0.162, 1.36), A, 0.03, segs=3))          # rugplaat
        for sx in (-1, 1):
            body.append(rbox((0.06, 0.22, 0.25), (sx * 0.218, 0.0, 1.27), D, 0.02, segs=2))   # flankplaten
        body.append(rbox((0.17, 0.04, 0.14), (0, -0.142, 0.93), D, 0.015))                 # kruisflap
        body.append(loft([((0, 0.0, 1.50), 0.180, 0.150), ((0, 0.0, 1.58), 0.160, 0.140),
                          ((0, 0.0, 1.645), 0.128, 0.122)], A, n=16, e=0.8, caps=(False, False)))  # kraag
        # krachtpakket op de rug
        body.append(rbox((0.27, 0.12, 0.28), (0, 0.255, 1.33), D, 0.03, segs=2))
        for sx in (-1, 1):
            body.append(cyl(0.032, 0.30, (sx * 0.095, 0.33, 1.34), M['polymer'], verts=12))
        body.append(rbox((0.10, 0.012, 0.06), (0, 0.317, 1.24), M['tint'], 0.006))
        # schouderstukken (twee lagen)
        for s_, sx in ((RS, 1), (LS, -1)):
            body.append(ball(0.115, s_ + Vector((sx * 0.02, 0.0, 0.035)), A, scale=(1.0, 1.12, 0.62), seg=14, rings=8))
            body.append(ball(0.105, s_ + Vector((sx * 0.045, 0.0, -0.02)), D, scale=(0.9, 1.05, 0.55), seg=14, rings=8))
            body.append(rbox((0.012, 0.12, 0.022), s_ + Vector((sx * 0.105, 0.0, 0.035)), M['tint'], 0.004))
    else:  # scout: lichte chest rig, kruisband op de rug, drinkzak
        body.append(rbox((0.30, 0.05, 0.17), (0, -0.152, 1.265), M['vest'], 0.02, segs=2))
        for px in (-0.11, -0.037, 0.037, 0.11):
            body.append(rbox((0.066, 0.04, 0.11), (px, -0.19, 1.27), M['vest'], 0.01))
            body.append(rbox((0.07, 0.045, 0.028), (px, -0.192, 1.326), M['webbing'], 0.008))
        for sx in (-1, 1):
            pts = [(sx * 0.12, -0.15, 1.33), (sx * 0.115, -0.13, 1.47), (sx * 0.112, -0.06, 1.588), (sx * 0.112, 0.06, 1.588),
                   (sx * 0.08, 0.135, 1.45), (-sx * 0.10, 0.128, 1.20)]
            for p, q in zip(pts, pts[1:]):
                body.append(segment(p, q, 0.05, M['webbing'], 0.006, thick2=0.018))
        body.append(rbox((0.20, 0.065, 0.30), (0, 0.17, 1.35), M['vest'], 0.03, segs=2))   # drinkzak
        body.append(rbox((0.09, 0.012, 0.055), (0, 0.205, 1.40), M['tint'], 0.006))
        body.append(limb((0.07, 0.18, 1.48), (0.12, -0.05, 1.56), [(0, 0.009, 0.009), (1, 0.009, 0.009)], M['polymer'], n=6))
        body.append(rbox((0.055, 0.085, 0.13), (-0.215, 0.03, 1.24), M['webbing'], 0.012))  # radiotas
        body.append(cyl(0.035, 0.12, (0.215, 0.02, 1.04), M['webbing'], verts=10))          # veldfles
        body.append(rbox((0.10, 0.06, 0.08), (-0.12, 0.13, 1.0), M['webbing'], 0.015))

    # ------------------------------------------------ hoofd
    body.append(cyl(0.058, 0.1, (0, 0.0, 1.6), M['skin'], verts=12))
    body.append(loft([((0, -0.000, 1.615), 0.064, 0.072), ((0, -0.008, 1.665), 0.078, 0.092),
                      ((0, -0.010, 1.735), 0.086, 0.102), ((0, -0.004, 1.800), 0.086, 0.100),
                      ((0, 0.004, 1.860), 0.070, 0.084)], M['skin'], n=14))
    body.append(rbox((0.024, 0.026, 0.038), (0, -0.112, 1.730), M['skin'], 0.008))

    if kind == 'heavy':
        A, D = M['armor'], M['armordk']
        # gesloten helm met vizier, kaakstuk en filters
        body.append(loft([((0, 0.0, 1.60), 0.118, 0.128), ((0, -0.005, 1.66), 0.136, 0.150),
                          ((0, -0.005, 1.76), 0.141, 0.156), ((0, 0.0, 1.86), 0.121, 0.135),
                          ((0, 0.005, 1.92), 0.075, 0.088), ((0, 0.01, 1.945), 0.02, 0.025)], A, n=18, e=0.9))
        body.append(band(0, -0.005, 0.146, 0.161, 1.715, 1.785, -152, -28, 14, M['lens']))
        body.append(band(0, -0.005, 0.149, 0.164, 1.785, 1.80, -156, -24, 14, D))
        body.append(band(0, -0.005, 0.149, 0.164, 1.70, 1.715, -156, -24, 14, D))
        body.append(rbox((0.11, 0.05, 0.075), (0, -0.152, 1.648), D, 0.02, segs=2))      # kaakstuk
        for i in range(3):
            body.append(rbox((0.07, 0.006, 0.008), (0, -0.178, 1.628 + i * 0.02), M['polymer'], 0.002))
        for sx in (-1, 1):
            body.append(cyl(0.028, 0.05, (sx * 0.085, -0.125, 1.64), M['polymer'], rot=(math.pi / 2, 0, sx * 0.6), verts=12))
            body.append(rbox((0.02, 0.07, 0.05), (sx * 0.145, 0.0, 1.74), D, 0.008))      # zijrails
        # kamstreep (teamkleur) over het midden van de helm
        secs = []
        for i in range(13):
            th = -1.2 + i * (2.75 / 12)
            p = Vector((0, -0.003 + 0.162 * math.sin(th), 1.76 + 0.19 * math.cos(th)))
            nrm = Vector((0, math.sin(th) / 0.162, math.cos(th) / 0.19)).normalized()
            secs.append((p, 0.022, 0.007, 0.6, (1, 0, 0), tuple(nrm)))
        body.append(loft(secs, M['tint'], n=8, angle=40))
    elif kind == 'scout':
        # sjemag om de nek, zonnebril, oortje, boonie-hoed
        body.append(loft([((0, 0.0, 1.545), 0.092, 0.092), ((0, -0.010, 1.600), 0.100, 0.112),
                          ((0, -0.014, 1.640), 0.101, 0.116), ((0, -0.012, 1.670), 0.094, 0.108)],
                         M['scarf'], n=14, caps=(False, False)))
        body.append(rbox((0.10, 0.03, 0.09), (0, -0.115, 1.56), M['scarf'], 0.03, rot=(0.35, 0, 0)))
        body.append(band(0, -0.010, 0.092, 0.110, 1.742, 1.772, -150, -30, 10, M['lens']))
        body.append(band(0, -0.004, 0.090, 0.104, 1.758, 1.766, -30, 30, 4, M['polymer']))
        body.append(band(0, -0.004, 0.090, 0.104, 1.758, 1.766, 150, 210, 4, M['polymer']))
        body.append(ball(0.016, (0.088, 0.0, 1.73), M['polymer'], seg=8, rings=6))
        body.append(loft([((0, 0.005, 1.770), 0.103, 0.116), ((0, 0.005, 1.84), 0.101, 0.114),
                          ((0, 0.007, 1.885), 0.090, 0.101), ((0, 0.009, 1.905), 0.055, 0.064)],
                         M['camo'], n=16))                                                   # bol van de hoed
        body.append(loft([((0, 0.005, 1.792), 0.102, 0.115), ((0, 0.005, 1.784), 0.150, 0.162),
                          ((0, 0.005, 1.765), 0.198, 0.208), ((0, 0.005, 1.748), 0.212, 0.222)],
                         M['camo'], n=24, caps=(False, False)))                              # slappe rand
        body.append(loft([((0, 0.005, 1.795), 0.106, 0.119), ((0, 0.005, 1.822), 0.105, 0.118)],
                         M['tint'], n=16, caps=(False, False)))                              # hoedband
        for sx in (-1, 1):
            body.append(limb((sx * 0.1, 0.005, 1.79), (sx * 0.03, -0.075, 1.6), [(0, 0.006, 0.002), (1, 0.006, 0.002)], M['webbing'], n=4))
    else:  # ghillie: kap met teamband en plukken
        body.append(loft([((0, 0.0, 1.565), 0.078, 0.078), ((0, -0.008, 1.625), 0.084, 0.096),
                          ((0, -0.012, 1.665), 0.089, 0.105), ((0, -0.012, 1.688), 0.088, 0.104)],
                         M['camo'], n=14, caps=(False, False)))
        body.append(shell(M['camo'], 0.0, 0.88, 5, s=1.04, cap=True))
        body.append(shell(M['tint'], 0.30, 0.46, 1, s=1.075))        # teamband rond de kap
        r = tufts.rnd
        for _ in range(110):
            t = r.uniform(0.0, 0.97)
            if 0.22 < t < 0.52:                   # teamband vrij laten
                continue
            a = r.uniform(0, 2 * math.pi)
            deg = (math.degrees(a) + 360) % 360
            front = 215 < deg < 325
            if front and t < 0.75:                # gezicht vrij laten
                continue
            p = helm_pt(t, a, 1.04)
            nrm = (p - HC).normalized()
            if t >= 0.52:                         # kort op de kruin (hangt niet over de band)
                tufts.add(p, nrm, length=r.uniform(0.035, 0.07))
            else:                                 # sluier over nek en schouders
                tufts.add(p, nrm, length=r.uniform(0.10, 0.20))

    # ------------------------------------------------ armen in schiethouding
    for s_, e_, h_, sx in ((RS, RE, RH, 1), (LS, LE, LH, -1)):
        d = (h_ - e_).normalized()
        wrist = h_ - d * 0.055
        upper = [(t, rx * (1.12 if kind == 'heavy' else 1), ry * (1.12 if kind == 'heavy' else 1)) for t, rx, ry in UPPER]
        body.append(limb(s_, e_, upper, M['camo'], n=10))
        if kind == 'scout':
            # opgerolde mouw: onderarm bloot, dikke rol boven de elleboog
            body.append(limb(e_, wrist, FORE, M['skin'], n=10))
            body.append(ring(s_.lerp(e_, 0.86), e_ - s_, 0.064, 0.06, 0.05, M['camo'], bulge=1.12))
        else:
            body.append(limb(e_, wrist, FORE, M['camo'], n=10))
        body.append(ball(0.074, s_ + Vector((0, 0, 0.012)), M['camo'], scale=(1.0, 1.0, 0.95)))
        body.append(ball(0.062 if kind != 'heavy' else 0.07, e_ + (e_ - s_).normalized() * 0.01 + Vector((0, 0, -0.008)),
                         M['armor'] if kind == 'heavy' else M['webbing'], seg=10, rings=6))
        if kind == 'heavy':
            body.append(segment(e_.lerp(wrist, 0.18), e_.lerp(wrist, 0.82), 0.075, M['armor'], 0.012, thick2=0.068))
        body.append(limb(wrist - d * 0.02, h_ + d * 0.06, GLOVE, M['glove'], n=10, e=0.8))
        side = Vector((0, 0, 1)).cross(d).normalized()
        body.append(limb(h_ - d * 0.015 + Vector((0, 0, 0.028)), h_ + d * 0.035 + Vector((0, 0, 0.034)) + side * 0.012,
                         [(0, 0.016, 0.016), (1, 0.013, 0.013), (1.15, 0.008, 0.008)], M['glove'], n=6))
        if tufts:
            r = tufts.rnd
            # schouders
            for _ in range(22):
                a = r.uniform(0, 2 * math.pi)
                el = r.uniform(0.1, 1.3)
                nrm = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)))
                tufts.add(s_ + Vector((0, 0, 0.012)) + nrm * 0.08, nrm)
            # bovenarm (links niet bij de armband)
            for _ in range(20):
                t = r.uniform(0.05, 0.85)
                if sx < 0 and 0.2 < t < 0.5:
                    continue
                U, V = perp_frame(e_ - s_)
                a = r.uniform(0, 2 * math.pi)
                nrm = U * math.cos(a) + V * math.sin(a)
                if nrm.z < -0.5:
                    continue
                tufts.add(s_.lerp(e_, t) + nrm * 0.06, nrm, length=r.uniform(0.07, 0.13))
    body.append(limb(LS.lerp(LE, 0.28), LS.lerp(LE, 0.42),
                     [(0, 0.069 * (1.12 if kind == 'heavy' else 1), 0.066 * (1.12 if kind == 'heavy' else 1)),
                      (1, 0.066 * (1.12 if kind == 'heavy' else 1), 0.062 * (1.12 if kind == 'heavy' else 1))], M['tint'], n=10))
    if kind == 'scout':
        body.append(ring(LE.lerp(LH, 0.86), LH - LE, 0.044, 0.042, 0.022, M['polymer']))   # horloge

    if tufts:
        r = tufts.rnd
        # romp: vooral rug en schouders, minder op de borst
        for _ in range(250):
            z = r.uniform(0.9, 1.58)
            a = r.uniform(0, 2 * math.pi)
            ny = math.sin(a)
            if ny < -0.2 and r.random() > 0.6:
                continue
            rx = 0.215 if z > 1.1 else 0.2
            ry = (0.29 if (abs(math.cos(a)) < 0.6 and 1.18 < z < 1.5) else 0.18) if ny > 0 else 0.17
            p = Vector((math.cos(a) * rx, math.sin(a) * ry, z))
            nrm = Vector((math.cos(a), math.sin(a), 0.25 if z > 1.45 else 0.0))
            # teampatch op de rug vrij laten (ook geen plukken erboven die eroverheen hangen)
            if abs(p.x) < 0.1 and z > 1.3 and ny > 0.7:
                continue
            tufts.add(p, nrm)
        body += tufts.objects()

    torso = join(body, 'body', origin=(0, 0, 0))
    export(kind + '.glb', [legL, legR, torso], uv=(kind != 'heavy'))


# ================================================================ camo voor soldaat-varianten

def build_camo_textures():
    reset_all()
    save_jpg('camo_desert', camo_desert())
    save_jpg('camo_arctic', camo_arctic())
    save_jpg('camo_urban', camo_urban())
    save_jpg('camo_night', camo_night())
    save_jpg('camo_digital', camo_digital())


build_camo_textures()
build_shellninja()
build_trooper('heavy')
build_trooper('scout')
build_trooper('ghillie')
print('SKINS KLAAR')
