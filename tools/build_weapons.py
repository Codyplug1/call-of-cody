"""
Bouwt de extra wapens (fase 2) met Blender en exporteert ze als .glb naar public/models/.
build_models.py blijft het script voor de soldaat, rifle, shotgun en de omgeving.

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/build_weapons.py

Zelfde contract als rifle.glb (zie build_models.py):
  oorsprong = pistoolgreep (rechterhand), loop naar -Y, Z omhoog.
  De linkerhand van de soldaat zit op ongeveer (-0.045, -0.275, 0.02) t.o.v. de oorsprong,
  dus elk wapen heeft daar een handbescherming of voorgreep.
  In de game wordt Blender (x, y, z) -> (x, z, -y); mondingspunten staan in shared.js (WEAPONS[..].muzzle):
  smg.glb    : loop op z=0.07, monding y=-0.45
  sniper.glb : loop op z=0.075, monding y=-1.06
  lmg.glb    : loop op z=0.07, monding y=-1.01
  dmr.glb    : loop op z=0.07, monding y=-0.99
Alle ontwerpen zijn generiek (geen bestaande merken of wapens uit andere games).
"""
import math
import os

import bpy
import bmesh
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
os.makedirs(OUT, exist_ok=True)

Y = (math.pi / 2, 0, 0)          # cilinder-as langs Y
X = (0, math.pi / 2, 0)          # cilinder-as langs X


# ---------------------------------------------------------------- basis (gekopieerd uit build_models.py)

def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


_mats = {}


def material(name, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    _mats[name] = m
    return m


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


def box(size, loc, mat, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, bevel, segs=1 if bevel <= 0.005 else 2)


def rbox(size, loc, mat, r=0.008, rot=(0, 0, 0), segs=1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, r, segs=segs, harden=True)


def cyl(r, depth, loc, mat, rot=Y, verts=12, r2=None, bevel=0.0, smooth=True):
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


def segment(p1, p2, thick, mat, bevel=0.002, thick2=None):
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


def loft(sections, mat, n=12, e=1.0, caps=(True, True), u=(1, 0, 0), v=(0, 0, 1), smooth=True, angle=50):
    """Buis door doorsneden (centrum, rx, ry[, exponent[, U, V]]). Standaard: doorsnede in het XZ-vlak."""
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
    for i in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for l, t in zip(f.loops, [(k / n, i), ((k + 1) / n, i), ((k + 1) / n, i + 1), (k / n, i + 1)]):
                l[uvl].uv = t
    if caps[0]:
        bm.faces.new(list(reversed(rings[0])))
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(mesh_object(bm, 'loft'), mat, smooth=smooth, angle=angle)


def limb(p1, p2, prof, mat, n=10, e=1.0, angle=60):
    a, b = Vector(p1), Vector(p2)
    d = (b - a).normalized()
    Xv = Vector((1, 0, 0))
    U = Xv - d * Xv.dot(d)
    if U.length < 1e-3:
        U = Vector((0, 1, 0)) - d * d.y
    U.normalize()
    V = d.cross(U).normalized()
    secs = [(a + (b - a) * t, rx, ry, None, U, V) for (t, rx, ry) in prof]
    return loft(secs, mat, n=n, e=e, angle=angle)


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
    o.location = (0, 0, 0)
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


# ---------------------------------------------------------------- materialen (zelfde namen als build_models.py)

M = {
    'gun': material('Gunmetal', (0.06, 0.06, 0.07), 0.45, 0.6),
    'polymer': material('Polymer', (0.12, 0.12, 0.12), 0.7),
    'fde': material('FDE', (0.30, 0.28, 0.20), 0.75),
    'wood': material('GunWood', (0.36, 0.21, 0.11), 0.6),
    'lens': material('Lens', (0.05, 0.06, 0.07), 0.15, 0.4),
    'metal': material('Metal', (0.30, 0.31, 0.30), 0.5, 0.7),
    'od': material('ODGreen', (0.17, 0.20, 0.12), 0.75),
    'canvas': material('Canvas', (0.26, 0.27, 0.18), 0.95),
    'brass': material('Brass', (0.55, 0.42, 0.16), 0.4, 0.8),
    'red': material('RedDot', (0.9, 0.08, 0.05), 0.3),
}


# ---------------------------------------------------------------- gedeelde onderdelen

def grip(mat):
    """Pistoolgreep (zelfde maat als rifle.glb, zodat de rechterhand past) + trekker en beugel."""
    return [
        limb((0, 0.012, 0.0), (0, 0.05, -0.105), [(0, 0.018, 0.026), (0.5, 0.019, 0.028), (1, 0.018, 0.026)],
             mat, n=10, e=0.55),
        box((0.012, 0.09, 0.008), (0, -0.02, -0.035), M['gun'], 0.002),                 # trekkerbeugel
        box((0.012, 0.008, 0.03), (0, -0.063, -0.02), M['gun'], 0.002),
        box((0.006, 0.01, 0.024), (0, -0.03, -0.018), M['gun'], 0.002, rot=(math.radians(15), 0, 0)),  # trekker
    ]


def scope(y0, y1, z, r, r_obj, mat=None, turret=True):
    """Richtkijker van y0 (oog, achter) naar y1 (objectief, voor; y1 < y0)."""
    mat = mat or M['gun']
    L = y0 - y1
    bell = L * 0.16
    eye = L * 0.14
    tube0, tube1 = y0 - eye, y1 + bell + L * 0.12
    o = [
        cyl(r, tube0 - tube1, (0, (tube0 + tube1) / 2, z), mat, verts=16),                 # buis
        cyl(r * 1.35, eye * 0.6, (0, y0 - eye * 0.3, z), mat, verts=16),                  # oculair
        cyl(r, eye * 0.4, (0, y0 - eye * 0.8, z), mat, verts=16, r2=r * 1.35),
        cyl(r, bell, (0, tube1 - bell / 2, z), mat, verts=16, r2=r_obj),                  # trechter
        cyl(r_obj, L * 0.12, (0, y1 + L * 0.06, z), mat, verts=16),                       # objectief
        cyl(r_obj * 0.92, 0.004, (0, y1 - 0.001, z), M['lens'], verts=16),
        cyl(r * 1.2, 0.004, (0, y0 + 0.001, z), M['lens'], verts=16),
    ]
    mid = (tube0 + tube1) / 2
    if turret:
        o.append(cyl(r * 0.7, r * 1.4, (0, mid, z + r * 1.3), mat, rot=(0, 0, 0), verts=10))   # hoogteknop
        o.append(cyl(r * 0.7, r * 1.4, (r * 1.3, mid, z), mat, rot=X, verts=10))               # zijknop
    return o


def rings(ys, z_tube, z_rail, mat=None):
    mat = mat or M['gun']
    o = []
    for y in ys:
        o.append(box((0.024, 0.02, z_tube - z_rail), (0, y, (z_tube + z_rail) / 2), mat, 0.003))
    return o


def folded_bipod(y_mount, y_tip, z, spread=0.016):
    o = [box((0.04, 0.03, 0.02), (0, y_mount, z + 0.008), M['gun'], 0.003)]
    for sx in (-1, 1):
        o.append(segment((sx * spread, y_mount - 0.01, z), (sx * spread, y_tip, z + 0.01), 0.009, M['gun']))
        o.append(box((0.014, 0.02, 0.014), (sx * spread, y_tip - 0.005, z + 0.01), M['polymer'], 0.003))   # voetje
    return o


# ---------------------------------------------------------------- SMG: compact, klapkolf, verticale voorgreep

def build_smg():
    reset_scene()
    o = [
        box((0.05, 0.30, 0.06), (0, -0.11, 0.072), M['gun'], 0.006),                   # bovenbehuizing (y +0.04..-0.26)
        box((0.048, 0.19, 0.045), (0, -0.06, 0.024), M['polymer'], 0.006),             # onderbehuizing
        box((0.006, 0.06, 0.026), (0.026, -0.08, 0.075), M['polymer'], 0.002),         # uitwerpopening
        box((0.02, 0.29, 0.01), (0, -0.115, 0.107), M['gun'], 0.002),                  # rail
        cyl(0.025, 0.14, (0, -0.33, 0.07), M['gun'], verts=10, smooth=False),          # loopmantel (y -0.26..-0.40)
        cyl(0.011, 0.04, (0, -0.415, 0.07), M['gun'], verts=10),                       # loop
        cyl(0.016, 0.03, (0, -0.435, 0.07), M['gun'], verts=10),                       # mondingsstuk (tip y=-0.45)
        box((0.046, 0.15, 0.036), (0, -0.27, 0.03), M['polymer'], 0.006),              # handbescherming onder
        cyl(0.016, 0.1, (0, -0.29, -0.03), M['polymer'], rot=(math.radians(-8), 0, 0), verts=10),  # voorgreep
        box((0.007, 0.03, 0.012), (-0.028, -0.02, 0.085), M['gun'], 0.002),            # spanhendel (links)
        # red-dot vizier
        box((0.03, 0.045, 0.012), (0, -0.07, 0.118), M['gun'], 0.003),
        rbox((0.034, 0.04, 0.032), (0, -0.07, 0.14), M['gun'], 0.006),
        cyl(0.011, 0.003, (0, -0.091, 0.143), M['lens'], verts=12),
        ball(0.0025, (0, -0.07, 0.143), M['red'], seg=6, rings=4),
        box((0.008, 0.012, 0.03), (0, -0.25, 0.12), M['gun'], 0.002),                  # korrel
    ]
    for yy in (-0.29, -0.33, -0.37):                                                    # gaten in de mantel
        for sx in (-1, 1):
            o.append(box((0.006, 0.018, 0.012), (sx * 0.023, yy, 0.07), M['polymer'], 0.0))
    # recht magazijn, iets naar voren gekanteld
    o.append(rbox((0.03, 0.05, 0.19), (0, -0.155, -0.075), M['polymer'], 0.005, rot=(math.radians(-10), 0, 0)))
    o.append(rbox((0.036, 0.058, 0.014), (0, -0.172, -0.168), M['polymer'], 0.004, rot=(math.radians(-10), 0, 0)))
    o += grip(M['polymer'])
    # klapkolf: twee stangen + kolfplaat
    for sx in (-1, 1):
        o.append(segment((sx * 0.018, 0.035, 0.085), (sx * 0.018, 0.25, 0.06), 0.009, M['gun']))
        o.append(segment((sx * 0.018, 0.035, 0.03), (sx * 0.018, 0.25, 0.02), 0.008, M['gun']))
    o.append(rbox((0.05, 0.02, 0.1), (0, 0.255, 0.04), M['polymer'], 0.006))
    o.append(cyl(0.012, 0.05, (0, 0.04, 0.06), M['gun'], rot=X, verts=10))              # scharnier
    export('smg.glb', [join(o, 'smg')])


# ---------------------------------------------------------------- Sluipschuttersgeweer: grendel, grote kijker, tweepoot

def build_sniper():
    reset_scene()
    o = [
        cyl(0.023, 0.26, (0, -0.07, 0.075), M['gun'], verts=14),                       # ronde behuizing (y 0.06..-0.20)
        cyl(0.017, 0.80, (0, -0.60, 0.075), M['gun'], verts=12, r2=0.012),             # taps lopende loop (-0.20..-1.00)
        rbox((0.034, 0.065, 0.03), (0, -1.025, 0.075), M['gun'], 0.004),               # mondingsrem (tip y=-1.06)
        box((0.012, 0.035, 0.034), (0, -0.065, 0.105), M['gun'], 0.002),               # grendelbaan
        # grendelhendel rechts (= -X in Blender)
        cyl(0.007, 0.06, (-0.045, 0.02, 0.07), M['metal'], rot=X, verts=8),
        ball(0.014, (-0.078, 0.025, 0.058), M['metal']),
        box((0.026, 0.25, 0.008), (0, -0.07, 0.102), M['gun'], 0.002),                 # rail
        # schacht / voorhout (OD-groen), hand op y=-0.275
        rbox((0.056, 0.50, 0.06), (0, -0.26, 0.035), M['od'], 0.012, segs=2),
        rbox((0.06, 0.18, 0.05), (0, 0.0, 0.03), M['od'], 0.01, segs=2),
        box((0.035, 0.07, 0.06), (0, -0.115, -0.015), M['polymer'], 0.004),            # magazijn
    ]
    for yy in (-0.38, -0.42, -0.46):                                                    # gaten in het voorhout
        for sx in (-1, 1):
            o.append(box((0.006, 0.025, 0.02), (sx * 0.028, yy, 0.04), M['polymer'], 0.0))
    for k in range(3):                                                                  # sleuven mondingsrem
        for sx in (-1, 1):
            o.append(box((0.006, 0.008, 0.022), (sx * 0.017, -1.005 - k * 0.016, 0.075), M['polymer'], 0.0))
    o += grip(M['od'])
    # kolf met duimgat-achtige vorm (lofts) + wangsteun + kolfplaat
    o.append(loft([((0, 0.08, 0.035), 0.028, 0.03), ((0, 0.14, 0.03), 0.026, 0.035),
                   ((0, 0.22, 0.03), 0.025, 0.045), ((0, 0.31, 0.02), 0.026, 0.062)],
                  M['od'], n=12, e=0.5, angle=40))
    o.append(rbox((0.032, 0.14, 0.03), (0, 0.235, 0.088), M['od'], 0.01))              # wangsteun
    o.append(rbox((0.058, 0.03, 0.14), (0, 0.33, 0.02), M['polymer'], 0.012))          # kolfplaat
    o.append(box((0.012, 0.02, 0.05), (0, 0.29, -0.06), M['od'], 0.003))               # monopod-steun
    # grote richtkijker
    o += scope(0.11, -0.30, 0.16, 0.018, 0.033)
    o += rings((0.0, -0.15), 0.16, 0.106)
    o += folded_bipod(-0.48, -0.74, 0.0)
    export('sniper.glb', [join(o, 'sniper')])


# ---------------------------------------------------------------- LMG: zware behuizing, loopmantel, munitiekist

def build_lmg():
    reset_scene()
    o = [
        rbox((0.07, 0.34, 0.1), (0, -0.08, 0.06), M['gun'], 0.008),                    # behuizing (y 0.09..-0.25)
        rbox((0.074, 0.2, 0.026), (0, -0.075, 0.12), M['gun'], 0.008),                 # deksel van de toevoer
        box((0.02, 0.1, 0.012), (0, 0.03, 0.137), M['gun'], 0.002),                    # vizierrail
        box((0.006, 0.06, 0.04), (0.036, -0.12, 0.07), M['polymer'], 0.002),           # toevoeropening links
        cyl(0.03, 0.40, (0, -0.45, 0.07), M['gun'], verts=12, smooth=False),           # loopmantel (-0.25..-0.65)
        cyl(0.014, 0.31, (0, -0.80, 0.07), M['gun'], verts=10),                        # loop (-0.65..-0.955)
        cyl(0.02, 0.06, (0, -0.98, 0.07), M['gun'], verts=10),                         # vlamdemper (tip y=-1.01)
        box((0.008, 0.014, 0.05), (0, -0.92, 0.1), M['gun'], 0.002),                   # korrel
        box((0.06, 0.2, 0.04), (0, -0.33, 0.02), M['fde'], 0.008),                     # voorhout onder de mantel
        box((0.012, 0.05, 0.03), (0.04, -0.03, 0.07), M['gun'], 0.003),                # spanhendel
    ]
    for yy in (-0.30, -0.36, -0.42, -0.48, -0.54, -0.60):                               # koelgaten
        for sx in (-1, 1):
            o.append(box((0.008, 0.026, 0.014), (sx * 0.028, yy, 0.075), M['polymer'], 0.0))
    # draaghandgreep boven de mantel
    o.append(segment((0, -0.33, 0.1), (0, -0.36, 0.16), 0.014, M['gun']))
    o.append(segment((0, -0.50, 0.1), (0, -0.47, 0.16), 0.014, M['gun']))
    o.append(rbox((0.022, 0.15, 0.022), (0, -0.415, 0.165), M['polymer'], 0.008))
    # munitiekist + band
    o.append(rbox((0.085, 0.13, 0.12), (0.012, -0.15, -0.06), M['od'], 0.01, segs=2))
    o.append(box((0.088, 0.09, 0.01), (0.012, -0.15, -0.115), M['canvas'], 0.002))
    o.append(box((0.03, 0.05, 0.012), (0.056, -0.15, -0.04), M['metal'], 0.002))      # sluiting
    for k in range(4):
        o.append(cyl(0.006, 0.03, (0.044 + k * 0.004, -0.13 + k * 0.012, 0.03 - k * 0.008), M['brass'],
                     rot=X, verts=6))
    o += grip(M['polymer'])
    # kolf (dicht polymeer)
    o.append(loft([((0, 0.09, 0.07), 0.026, 0.035), ((0, 0.16, 0.06), 0.026, 0.045),
                   ((0, 0.26, 0.05), 0.027, 0.055), ((0, 0.33, 0.04), 0.028, 0.065)],
                  M['polymer'], n=12, e=0.45, angle=40))
    o.append(rbox((0.06, 0.03, 0.14), (0, 0.345, 0.04), M['polymer'], 0.012))
    o += folded_bipod(-0.66, -0.90, 0.035)
    export('lmg.glb', [join(o, 'lmg')])


# ---------------------------------------------------------------- DMR: halfautomaat, houten meubel, middelgrote kijker

def build_dmr():
    reset_scene()
    o = [
        box((0.052, 0.34, 0.06), (0, -0.1, 0.075), M['gun'], 0.006),                   # bovenbehuizing
        box((0.05, 0.25, 0.05), (0, -0.065, 0.025), M['gun'], 0.006),                  # onderbehuizing
        box((0.006, 0.07, 0.03), (0.027, -0.1, 0.075), M['polymer'], 0.002),           # uitwerpopening
        box((0.012, 0.05, 0.02), (-0.03, -0.02, 0.085), M['gun'], 0.003),              # spanhendel
        box((0.05, 0.045, 0.05), (0, -0.21, 0.01), M['gun'], 0.006),                   # magazijnschacht
        box((0.022, 0.66, 0.012), (0, -0.34, 0.112), M['gun'], 0.003),                 # rail
        cyl(0.012, 0.28, (0, -0.80, 0.07), M['gun'], verts=12),                        # loop (-0.66..-0.94)
        cyl(0.017, 0.05, (0, -0.965, 0.07), M['gun'], verts=10),                       # mondingsrem (tip y=-0.99)
    ]
    for k in range(3):
        for sx in (-1, 1):
            o.append(box((0.005, 0.007, 0.018), (sx * 0.016, -0.95 - k * 0.013, 0.07), M['polymer'], 0.0))
    # houten handbescherming (hoekig, superellips), hand op y=-0.275
    o.append(loft([((0, -0.24, 0.07), 0.031, 0.04), ((0, -0.28, 0.07), 0.034, 0.044),
                   ((0, -0.62, 0.07), 0.033, 0.042), ((0, -0.66, 0.072), 0.028, 0.036)],
                  M['wood'], n=12, e=0.55, angle=40))
    for yy in (-0.36, -0.42, -0.48, -0.54):                                             # ventilatiesleuven
        for sx in (-1, 1):
            o.append(box((0.006, 0.03, 0.012), (sx * 0.033, yy, 0.075), M['gun'], 0.0))
    # recht magazijn
    o.append(rbox((0.032, 0.07, 0.15), (0, -0.215, -0.07), M['polymer'], 0.005, rot=(math.radians(-6), 0, 0)))
    o += grip(M['polymer'])
    # houten precisiekolf
    o.append(cyl(0.014, 0.08, (0, 0.11, 0.06), M['gun'], verts=10))
    o.append(loft([((0, 0.13, 0.058), 0.022, 0.03), ((0, 0.18, 0.048), 0.025, 0.042),
                   ((0, 0.26, 0.038), 0.026, 0.052), ((0, 0.32, 0.03), 0.027, 0.062)],
                  M['wood'], n=12, e=0.5, angle=40))
    o.append(rbox((0.03, 0.12, 0.022), (0, 0.245, 0.097), M['wood'], 0.008))           # wangsteun
    o.append(rbox((0.054, 0.025, 0.135), (0, 0.335, 0.03), M['polymer'], 0.01))        # kolfplaat
    # middelgrote richtkijker
    o += scope(0.07, -0.26, 0.16, 0.016, 0.026)
    o += rings((-0.02, -0.15), 0.16, 0.118)
    export('dmr.glb', [join(o, 'dmr')])


build_smg()
build_sniper()
build_lmg()
build_dmr()
print('WAPENS KLAAR')
