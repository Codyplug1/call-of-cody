"""
Rendert previews van alle skins (zelfde materiaal-aanpassingen als game.js) en de
kleine plaatjes voor de skin-keuze in de lobby (public/models/skins/thumb_<id>.jpg).

Gebruik (vanuit de projectmap):
  node -e "console.log(JSON.stringify(require('./public/shared.js').SKINS))" > skins.json
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/render_skins.py -- skins.json [uitvoermap]

Zonder uitvoermap komen de grote previews in tools/previews/skins/.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'public', 'models')
THUMBS = os.path.join(MODELS, 'skins')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SKINS = json.load(open(argv[0], encoding='utf-8-sig'))
OUT = argv[1] if len(argv) > 1 else os.path.join(ROOT, 'tools', 'previews', 'skins')
ONLY = argv[2].split(',') if len(argv) > 2 else None
os.makedirs(OUT, exist_ok=True)

GRIP = Vector((0.13, -0.36, 1.24))
TEAM = 0xe53935


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    return tuple(srgb_to_lin(((h >> s) & 255) / 255) for s in (16, 8, 0))


def clean():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def import_glb(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'))
    return [o for o in bpy.data.objects if o not in before]


def bsdf_of(m):
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def base_image_node(m):
    b = bsdf_of(m)
    for l in m.node_tree.links:
        if l.to_node == b and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE':
            return l.from_node
    return None


def set_color(m, h):
    b = bsdf_of(m)
    for l in list(m.node_tree.links):
        if l.to_node == b and l.to_socket.name == 'Base Color':
            m.node_tree.links.remove(l)
    b.inputs['Base Color'].default_value = (*hex_lin(h), 1)


def apply_skin(objs, skin):
    camo_img = None
    if skin.get('camo'):
        camo_img = bpy.data.images.load(os.path.join(THUMBS, skin['camo'] + '.jpg'), check_existing=True)
    mats = {m for o in objs if o.type == 'MESH' for m in o.data.materials if m}
    colors = skin.get('colors') or {}
    for m in mats:
        name = m.name.split('.')[0]
        if name == 'Tint':
            set_color(m, TEAM)
            b = bsdf_of(m)
            for key in ('Emission Color', 'Emission'):
                if key in b.inputs:
                    b.inputs[key].default_value = (*hex_lin(TEAM), 1)
                    break
            if 'Emission Strength' in b.inputs:
                b.inputs['Emission Strength'].default_value = 0.25
        elif name == 'Camo' and camo_img is not None:
            n = base_image_node(m)
            if n:
                n.image = camo_img
        elif name == 'HelmetCover' and 'helmet' in skin:
            if skin['helmet'] == 'camo' and camo_img is not None:
                n = base_image_node(m)
                if n:
                    n.image = camo_img
            elif isinstance(skin['helmet'], int):
                set_color(m, skin['helmet'])
        if name in colors:
            set_color(m, colors[name])


def bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def setup_scene(bg=(0.55, 0.62, 0.70), ground=True):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    world = bpy.data.worlds.get('PreviewWorld') or bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    b = world.node_tree.nodes.get('Background')
    b.inputs['Color'].default_value = (*bg, 1)
    b.inputs['Strength'].default_value = 0.55
    scene.world = world
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.001))
        g = bpy.context.active_object
        gm = bpy.data.materials.new('Ground')
        gm.use_nodes = True
        gb = bsdf_of(gm)
        gb.inputs['Base Color'].default_value = (0.30, 0.31, 0.27, 1)
        gb.inputs['Roughness'].default_value = 1.0
        g.data.materials.append(gm)
    for nm, energy, ang, rot in (('Sun', 2.8, 4, (50, 0, -30)), ('Fill', 0.9, 30, (70, 0, 160)), ('Rim', 1.2, 10, (60, 0, 110))):
        L = bpy.data.lights.new(nm, 'SUN')
        L.energy = energy
        L.angle = math.radians(ang)
        lo = bpy.data.objects.new(nm, L)
        lo.rotation_euler = tuple(math.radians(v) for v in rot)
        scene.collection.objects.link(lo)


def camera(center, direction, ortho_scale):
    scene = bpy.context.scene
    for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
        bpy.data.objects.remove(o, do_unlink=True)
    cd = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cd)
    scene.collection.objects.link(cam)
    cd.type = 'ORTHO'
    cd.ortho_scale = ortho_scale
    d = Vector(direction).normalized()
    cam.location = center + d * 6
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam


def render(path, w, h, fmt='PNG'):
    s = bpy.context.scene
    s.render.resolution_x = w
    s.render.resolution_y = h
    s.render.image_settings.file_format = fmt
    if fmt == 'JPEG':
        s.render.image_settings.quality = 82
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('   ->', path)


for skin in SKINS:
    if ONLY and skin['id'] not in ONLY:
        continue
    clean()
    objs = import_glb(skin.get('model', 'soldier'))
    for g in import_glb('rifle'):
        if g.parent is None:
            g.location = GRIP
    apply_skin(objs, skin)
    lo, hi = bbox(objs)
    print('=== %s  bbox min=(%.3f, %.3f, %.3f) max=(%.3f, %.3f, %.3f)' % (skin['id'], *lo, *hi))
    setup_scene()
    c = Vector((0, -0.1, 0.98))
    camera(c, (0.75, -1.0, 0.35), 2.25)
    render(os.path.join(OUT, skin['id'] + '_front.png'), 600, 700)
    camera(c, (-0.8, 1.0, 0.35), 2.25)
    render(os.path.join(OUT, skin['id'] + '_back.png'), 600, 700)
    camera(Vector((0.02, -0.12, 1.68)), (0.55, -1.0, 0.12), 0.55)
    render(os.path.join(OUT, skin['id'] + '_head.png'), 500, 500)
    # lobby-plaatje: bovenlijf, donkere achtergrond (zelfde tint als de UI)
    for o in [o for o in bpy.data.objects if o.name.startswith('Plane')]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.worlds['PreviewWorld'].node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.035, 0.03, 1)
    # schildpad-ninja meer van opzij, zodat het rugschild te zien is
    camera(Vector((0.02, -0.06, 1.42)), (1.0, -0.42, 0.18) if skin['id'] == 'shellninja' else (0.6, -1.0, 0.18), 1.12)
    render(os.path.join(THUMBS, 'thumb_' + skin['id'] + '.jpg'), 112, 112, 'JPEG')
print('SKIN-PREVIEWS KLAAR')
