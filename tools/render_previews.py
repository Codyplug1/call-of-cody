"""
Rendert previews van alle .glb-modellen in public/models naar tools/previews/.

Gebruik (vanuit de projectmap):
  "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python tools/render_previews.py

Print ook per model: objecten, bounding box, materialen, driehoeken en bestandsgrootte.
"""
import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'public', 'models')
OUT = os.path.join(ROOT, 'tools', 'previews')
os.makedirs(OUT, exist_ok=True)

GRIP = Vector((0.13, -0.36, 1.24))
MODEL_NAMES = ['soldier', 'rifle', 'shotgun', 'sandbags', 'crate', 'tower', 'pine', 'rock']


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


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def report(name, objs):
    path = os.path.join(MODELS, name + '.glb')
    lo, hi = bbox(objs)
    print('=== %s  %.0f KB' % (name, os.path.getsize(path) / 1024))
    total = 0
    for o in objs:
        if o.type == 'MESH':
            t = tri_count(o)
            total += t
            mats = [m.name for m in o.data.materials if m]
            print('   %-10s origin=(%.3f, %.3f, %.3f) tris=%d mats=%s' % (o.name, *o.matrix_world.translation, t, mats))
    print('   bbox min=(%.3f, %.3f, %.3f) max=(%.3f, %.3f, %.3f) totaal tris=%d' % (*lo, *hi, total))


def setup_scene(lo, hi):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass
    world = bpy.data.worlds.get('PreviewWorld') or bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.70, 1)
    bg.inputs['Strength'].default_value = 0.45
    scene.world = world

    size = max((hi - lo).length, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=size * 8, location=(0, 0, min(lo.z, 0) - 0.001))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new('Ground')
    gm.use_nodes = True
    b = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.32, 0.32, 0.30, 1)
    b.inputs['Roughness'].default_value = 1.0
    ground.data.materials.append(gm)

    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.energy = 2.6
    sun.angle = math.radians(4)
    so = bpy.data.objects.new('Sun', sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(-30))
    scene.collection.objects.link(so)
    fill = bpy.data.lights.new('Fill', 'SUN')
    fill.energy = 0.8
    fill.angle = math.radians(30)
    fo = bpy.data.objects.new('Fill', fill)
    fo.rotation_euler = (math.radians(70), 0, math.radians(160))
    scene.collection.objects.link(fo)


def camera(lo, hi, direction, ortho=False):
    scene = bpy.context.scene
    center = (lo + hi) / 2
    size = (hi - lo)
    radius = max(size.length / 2, 0.3)
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    d = Vector(direction).normalized()
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = max(size.x, size.y, size.z) * 1.15
        cam.location = center + d * (radius * 4)
    else:
        cam_data.lens = 50
        dist = radius / math.tan(math.radians(18)) * 1.05
        cam.location = center + d * dist
    cam_data.clip_end = 1000
    look = center - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('   ->', path)


def three_quarter():
    # voorkant = -Y; camera links-voor en iets boven
    return (0.75, -1.0, 0.55)


for name in MODEL_NAMES:
    clean()
    objs = import_glb(name)
    report(name, objs)
    lo, hi = bbox(objs)
    extra = []
    if name == 'soldier':
        gun = import_glb('rifle')
        for g in gun:
            if g.parent is None:
                g.location = GRIP
        extra = gun
    setup_scene(lo, hi)
    camera(lo, hi, three_quarter())
    render(os.path.join(OUT, name + '.png'))
    if name in ('rifle', 'shotgun'):
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(o, do_unlink=True)
        camera(lo, hi, (1, 0, 0), ortho=True)
        render(os.path.join(OUT, name + '_side.png'))
    if name == 'soldier':
        lo2, hi2 = bbox(objs + extra)
        for view, d in (('front', (0, -1, 0)), ('side', (1, 0, 0)), ('top', (0, 0, 1))):
            for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
                bpy.data.objects.remove(o, do_unlink=True)
            camera(lo2, hi2, d, ortho=True)
            render(os.path.join(OUT, 'soldier_%s.png' % view))
        # close-up van handen en geweer
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(o, do_unlink=True)
        camera(Vector((-0.35, -0.95, 1.0)), Vector((0.45, 0.4, 1.95)), (0.9, -1.0, 0.3))
        render(os.path.join(OUT, 'soldier_closeup.png'))
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(o, do_unlink=True)
        camera(Vector((-0.1, -0.8, 1.05)), Vector((0.4, -0.1, 1.5)), (1.0, -0.6, 0.4))
        render(os.path.join(OUT, 'soldier_hands.png'))
print('PREVIEWS KLAAR')
