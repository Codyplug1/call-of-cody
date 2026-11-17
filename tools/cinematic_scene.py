"""
Korte filmische scene (5 s) met Cycles op de GPU: soldaat in een mistig dennenbos bij zonsopkomst.
Omgeving: fotogescande CC0-assets van Poly Haven (eerst tools/fetch_assets.ps1 draaien).
Soldaat, geweer en zandzakken: onze eigen game-modellen uit public/models.

Testbeeld:  blender -b --factory-startup --python tools/cinematic_scene.py -- test [frame]
Volledig:   blender -b --factory-startup --python tools/cinematic_scene.py -- full
Beelden komen in renders/cinematic/.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'public', 'models')
ASSETS = os.path.join(ROOT, 'renders', 'assets')
OUT = os.path.join(ROOT, 'renders', 'cinematic')
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['test']
MODE = ARGS[0]
TEST_FRAME = int(ARGS[1]) if len(ARGS) > 1 else 60
random.seed(11)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
FPS, FRAMES = 24, 120


# ---------------------------------------------------------------- helpers

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def empty(name, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    scene.collection.objects.link(e)
    return e


def principled(mat):
    if not mat or not mat.node_tree:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def add_micro_detail(mat, strength=0.12, scale=180.0):
    """Fijne bobbels + ruwheidsvariatie zodat egale vlakken er minder 'plastic' uitzien."""
    b = principled(mat)
    if not b or b.inputs['Normal'].is_linked:
        return
    nt = mat.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    if not b.inputs['Roughness'].is_linked:
        r = b.inputs['Roughness'].default_value
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['To Min'].default_value = max(0.05, r - 0.15)
        mr.inputs['To Max'].default_value = min(1.0, r + 0.1)
        nt.links.new(noise.outputs['Fac'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])


def world_bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def load_variants(asset_id):
    """Laadt een Poly Haven-asset. Geeft per losse variant (bv. elke rots of graspol) een verborgen collectie
    terug, met de voet op (0,0,0), plus de afmetingen. Onderdelen die elkaar overlappen horen bij dezelfde variant."""
    path = os.path.join(ASSETS, asset_id, asset_id + '.gltf')
    if not os.path.exists(path):
        print('ONTBREEKT:', asset_id)
        return []
    objs = imp(path)
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.context.view_layer.update()
    boxes = [world_bbox(o) for o in meshes]
    group = list(range(len(meshes)))

    def find(i):
        while group[i] != i:
            i = group[i]
        return i
    for i in range(len(meshes)):
        for j in range(i + 1, len(meshes)):
            (a0, a1), (b0, b1) = boxes[i], boxes[j]
            ox = min(a1.x, b1.x) - max(a0.x, b0.x)
            oy = min(a1.y, b1.y) - max(a0.y, b0.y)
            small = max(1e-4, min(a1.x - a0.x, b1.x - b0.x, a1.y - a0.y, b1.y - b0.y))
            if ox > 0.3 * small and oy > 0.3 * small:
                group[find(i)] = find(j)
    clusters = {}
    for i in range(len(meshes)):
        clusters.setdefault(find(i), []).append(i)
    out = []
    for n, idxs in enumerate(clusters.values()):
        lo = Vector((min(boxes[i][0].x for i in idxs), min(boxes[i][0].y for i in idxs), min(boxes[i][0].z for i in idxs)))
        hi = Vector((max(boxes[i][1].x for i in idxs), max(boxes[i][1].y for i in idxs), max(boxes[i][1].z for i in idxs)))
        col = bpy.data.collections.new('%s_%d' % (asset_id, n))
        shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        for i in idxs:
            o = meshes[i]
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            o.location = o.location - shift
        size = hi - lo
        out.append({'col': col, 'w': max(size.x, size.y), 'h': size.z})
    for o in objs:                       # lege hulpobjecten opruimen
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    print('ASSET %-24s %d variant(en): %s' % (asset_id, len(out), ', '.join('%.2fx%.2f m' % (v['w'], v['h']) for v in out)))
    return out


dg = None


def ground_z(x, y):
    hit, loc, *_ = scene.ray_cast(dg, Vector((x, y, 60)), Vector((0, 0, -1)))
    return loc.z if hit else 0.0


scatter_col = bpy.data.collections.new('Scatter')
scene.collection.children.link(scatter_col)


def place(variant, x, y, rot=None, scale=1.0, sink=0.0, tilt=0.0):
    e = bpy.data.objects.new('i_' + variant['col'].name, None)
    e.instance_type = 'COLLECTION'
    e.instance_collection = variant['col']
    e.location = (x, y, ground_z(x, y) - sink)
    e.rotation_euler = (random.uniform(-tilt, tilt), random.uniform(-tilt, tilt), random.uniform(0, 6.283) if rot is None else rot)
    e.scale = (scale, scale, scale)
    scatter_col.objects.link(e)
    return e


# ---------------------------------------------------------------- grond

bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'Ground'
sub = ground.modifiers.new('sub', 'SUBSURF')
sub.subdivision_type = 'SIMPLE'
sub.levels = 6
sub.render_levels = 7
tex = bpy.data.textures.new('hills', 'CLOUDS')
tex.noise_scale = 9.0
disp = ground.modifiers.new('disp', 'DISPLACE')
disp.texture = tex
disp.strength = 1.1
disp.mid_level = 0.5

gm = new_mat('GroundMat')
nt = gm.node_tree
gb = principled(gm)
gdir = os.path.join(ASSETS, 'forest_ground_04')


def ground_tex(prefix, non_color):
    f = next((n for n in os.listdir(gdir) if n.startswith(prefix + '.')), None) if os.path.isdir(gdir) else None
    if not f:
        return None
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(os.path.join(gdir, f))
    if non_color:
        n.image.colorspace_settings.name = 'Non-Color'
    nt.links.new(mapping.outputs['Vector'], n.inputs['Vector'])
    return n


coord = nt.nodes.new('ShaderNodeTexCoord')
mapping = nt.nodes.new('ShaderNodeMapping')
mapping.inputs['Scale'].default_value = (48, 48, 48)      # tegel van 2,5 m
mapping.inputs['Rotation'].default_value = (0, 0, 0.6)
nt.links.new(coord.outputs['UV'], mapping.inputs['Vector'])
d = ground_tex('Diffuse', False)
if d:
    # grote, zachte kleurvariatie zodat het tegelpatroon niet opvalt
    big = nt.nodes.new('ShaderNodeTexNoise')
    big.inputs['Scale'].default_value = 0.25
    big.inputs['Detail'].default_value = 6
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 0.55
    mr.inputs['To Max'].default_value = 1.15
    nt.links.new(big.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], hsv.inputs['Value'])
    nt.links.new(d.outputs['Color'], hsv.inputs['Color'])
    nt.links.new(hsv.outputs['Color'], gb.inputs['Base Color'])
else:
    gb.inputs['Base Color'].default_value = (0.09, 0.08, 0.05, 1)
r = ground_tex('Rough', True)
if r:
    nt.links.new(r.outputs['Color'], gb.inputs['Roughness'])
nrm = ground_tex('nor_gl', True)
if nrm:
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = 1.4
    nt.links.new(nrm.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], gb.inputs['Normal'])
ground.data.materials.append(gm)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

# ---------------------------------------------------------------- soldaat + geweer (zoals in de game)

SOLDIER_Z = ground_z(0, 0)
root = empty('SoldierRoot', (0, 0, SOLDIER_Z))
mirror = empty('SoldierMirror')
mirror.parent = root
mirror.scale = (-1, 1, 1)                 # zelfde spiegeling als game.js: geweer in de rechterhand
for o in imp(os.path.join(MODELS, 'soldier.glb')):
    if o.parent is None:
        o.parent = mirror
gun = empty('Gun', (-0.13, -0.36, 1.24))  # game.js: gun.position (-0.13, 1.24, 0.36) in glTF-assen
gun.parent = root
for o in imp(os.path.join(MODELS, 'rifle.glb')):
    if o.parent is None:
        o.parent = gun
bags = empty('Sandbags', (-1.9, -0.9, ground_z(-1.9, -0.9) - 0.04))
bags.rotation_euler = (0, 0, math.radians(28))
for o in imp(os.path.join(MODELS, 'sandbags.glb')):
    if o.parent is None:
        o.parent = bags
for m in bpy.data.materials:
    if m.name.startswith('Tint'):
        b = principled(m)
        if b:
            b.inputs['Base Color'].default_value = (0.15, 0.03, 0.02, 1)    # gedempte teamkleur
    elif m.name != 'GroundMat':
        add_micro_detail(m, 0.25 if m.name.startswith(('Camo', 'Vest', 'Webbing', 'Burlap', 'HelmetCover', 'Scarf')) else 0.1,
                         420.0 if m.name.startswith(('Camo', 'Vest', 'Webbing', 'HelmetCover', 'Scarf')) else 160.0)

# ---------------------------------------------------------------- bos (Poly Haven)

CAM_A, CAM_B = Vector((4.3, -6.6)), Vector((2.7, -4.6))     # begin- en eindpunt van de camera (x, y)


def in_view_corridor(x, y, margin):
    """Houd de strook tussen camera en soldaat vrij."""
    p, a, bb = Vector((x, y)), Vector((0, 0)), CAM_A + (CAM_A - Vector((0, 0))).normalized() * 3
    ab = bb - a
    t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length < margin


trees = load_variants('fir_tree_01') + load_variants('pine_tree_01')
saplings = load_variants('fir_sapling_medium') + load_variants('pine_sapling_medium')
grass = load_variants('grass_medium_01')
ferns = load_variants('fern_02')
rocks = load_variants('rock_moss_set_01')
stumps = load_variants('tree_stump_01')
logs = load_variants('dead_tree_trunk')
branches = load_variants('dry_branches_medium_01')
moss = load_variants('moss_01')
crates = load_variants('wooden_military_crate')
ammo = load_variants('ammo_box')

placed = []
tries = 0
while trees and len(placed) < 110 and tries < 8000:
    tries += 1
    x, y = random.uniform(-45, 45), random.uniform(-16, 55)
    if in_view_corridor(x, y, 3.0) or math.hypot(x, y) < 4.0 or math.hypot(x + 1.9, y + 0.9) < 2.5:
        continue
    if any(math.hypot(x - px, y - py) < 3.4 for px, py in placed):
        continue
    placed.append((x, y))
    place(random.choice(trees), x, y, scale=random.uniform(0.85, 1.35), sink=0.12, tilt=0.03)
print('bomen geplaatst:', len(placed))

for _ in range(70 if saplings else 0):
    x, y = random.uniform(-22, 22), random.uniform(-10, 30)
    if not in_view_corridor(x, y, 1.6) and math.hypot(x, y) > 2.0:
        place(random.choice(saplings), x, y, scale=random.uniform(0.6, 1.3), sink=0.03, tilt=0.06)

if grass:
    gw = sum(v['w'] for v in grass) / len(grass)
    n = 0
    big_grass = [v for v in grass if v['w'] > 0.12]
    for _ in range(60000):
        x, y = random.uniform(-8, 10), random.uniform(-10, 9)
        if math.hypot(x, y) < 0.3:
            continue
        # plukken groeien in groepen: sla open plekken (pad, kale aarde) deels over
        if (math.sin(x * 0.9 + 1.3) * math.cos(y * 0.8) + math.sin(x * 2.3 + y * 1.7) * 0.5) < -0.45 and random.random() < 0.85:
            continue
        place(random.choice(big_grass), x, y, scale=random.uniform(1.1, 2.6), sink=0.02, tilt=0.12)
        n += 1
    print('graspollen:', n, 'gemiddelde breedte', round(gw, 2))

for _ in range(160 if ferns else 0):
    x, y = random.uniform(-12, 12), random.uniform(-9, 16)
    if math.hypot(x, y) > 1.0 and not in_view_corridor(x, y, 0.5):
        place(random.choice(ferns), x, y, scale=random.uniform(0.7, 1.4), sink=0.02, tilt=0.15)
for _ in range(45 if branches else 0):
    place(random.choice(branches), random.uniform(-9, 10), random.uniform(-9, 12), scale=random.uniform(0.7, 1.2), sink=0.01)
for _ in range(16 if rocks else 0):
    x, y = random.uniform(-11, 12), random.uniform(-8, 16)
    if math.hypot(x, y) > 3.0 and not in_view_corridor(x, y, 1.2):
        s = random.uniform(0.12, 0.42)
        place(random.choice(rocks), x, y, scale=s, sink=0.12 * s, tilt=0.2)
if stumps:
    place(stumps[0], 2.3, 1.9, scale=1.0, sink=0.03)
    place(stumps[-1], -4.6, 3.8, scale=1.1, sink=0.03)
if logs:
    place(logs[0], -3.4, 2.6, rot=math.radians(70), scale=1.0, sink=0.05)
if crates:
    place(crates[0], 1.35, 0.55, rot=math.radians(24), sink=0.02)
if ammo:
    place(ammo[0], 0.95, -0.25, rot=math.radians(-35), sink=0.01)
    place(ammo[-1], 1.25, 0.6, rot=math.radians(10)).location.z += crates[0]['h'] if crates else 0

# ---------------------------------------------------------------- licht en atmosfeer

world = bpy.data.worlds.new('World')
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
wn = world.node_tree
bg = next(n for n in wn.nodes if n.type == 'BACKGROUND')
hdr = os.path.join(ASSETS, 'misty_pines', 'misty_pines_4k.hdr')
if os.path.exists(hdr):
    env = wn.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdr)
    wc = wn.nodes.new('ShaderNodeTexCoord')
    wm = wn.nodes.new('ShaderNodeMapping')
    wm.inputs['Rotation'].default_value = (0, 0, math.radians(200))
    wn.links.new(wc.outputs['Generated'], wm.inputs['Vector'])
    wn.links.new(wm.outputs['Vector'], env.inputs['Vector'])
    wn.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.55
else:
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.7, 1)
    bg.inputs['Strength'].default_value = 0.5

sun_data = bpy.data.lights.new('Sun', 'SUN')
sun_data.energy = 15.0
sun_data.angle = math.radians(1.2)
sun_data.color = (1.0, 0.74, 0.50)
sun = bpy.data.objects.new('Sun', sun_data)
scene.collection.objects.link(sun)
sun.location = (-16, 34, SOLDIER_Z + 9.5)        # laag achter het bos, schuin tegen de camera in
st = sun.constraints.new('TRACK_TO')
st.target = root
st.track_axis = 'TRACK_NEGATIVE_Z'
st.up_axis = 'UP_Y'

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 15, SOLDIER_Z + 12))
fog = bpy.context.active_object
fog.name = 'Fog'
fog.scale = (118, 118, 30)
fm = new_mat('FogMat')
nt = fm.node_tree
for n in list(nt.nodes):
    if n.type == 'BSDF_PRINCIPLED':
        nt.nodes.remove(n)
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.0065
vol.inputs['Anisotropy'].default_value = 0.72
vol.inputs['Color'].default_value = (0.86, 0.90, 0.95, 1)
nt.links.new(vol.outputs[0], next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs['Volume'])
fog.data.materials.append(fm)

# een paar stofdeeltjes die oplichten in het tegenlicht
dust_mesh = bpy.data.meshes.new('Dust')
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.0035)
bm.to_mesh(dust_mesh)
bm.free()
dm = new_mat('DustMat')
nt = dm.node_tree
for n in list(nt.nodes):
    if n.type == 'BSDF_PRINCIPLED':
        nt.nodes.remove(n)
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (1.0, 0.82, 0.6, 1)
em.inputs['Strength'].default_value = 2.5
nt.links.new(em.outputs[0], next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
dust_mesh.materials.append(dm)
for i in range(70):
    dd = bpy.data.objects.new('dust%d' % i, dust_mesh)
    scene.collection.objects.link(dd)
    p = Vector((random.uniform(-2.0, 4.0), random.uniform(-4.0, 2.5), SOLDIER_Z + random.uniform(0.4, 2.6)))
    dd.location = p
    dd.keyframe_insert('location', frame=1)
    dd.location = p + Vector((random.uniform(-0.12, 0.2), random.uniform(-0.08, 0.08), random.uniform(-0.04, 0.1)))
    dd.keyframe_insert('location', frame=FRAMES)

# ---------------------------------------------------------------- animatie

def key(obj, path, frame, value):
    setattr(obj, path, value)
    obj.keyframe_insert(path, frame=frame)


key(root, 'rotation_euler', 1, (0, 0, math.radians(-16)))        # soldaat speurt langzaam rond
key(root, 'rotation_euler', FRAMES, (0, 0, math.radians(8)))

target = empty('CamTarget')
cam_data = bpy.data.cameras.new('Cam')
cam_data.lens = 50
cam_data.sensor_width = 36
cam_data.dof.use_dof = True
cam_data.dof.focus_object = target
cam_data.dof.aperture_fstop = 2.0
cam_data.dof.aperture_blades = 7
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
tr = cam.constraints.new('TRACK_TO')
tr.target = target
tr.track_axis = 'TRACK_NEGATIVE_Z'
tr.up_axis = 'UP_Y'
gz = SOLDIER_Z
key(cam, 'location', 1, (CAM_A.x, CAM_A.y, gz + 0.95))             # langzame dolly + kleine boog omhoog
key(cam, 'location', FRAMES, (CAM_B.x, CAM_B.y, gz + 1.35))
key(target, 'location', 1, (0.15, 0, gz + 1.25))
key(target, 'location', FRAMES, (-0.05, 0, gz + 1.5))

# ---------------------------------------------------------------- render

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for dev_type in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        gpus = [dv for dv in prefs.devices if dv.type == dev_type]
        if gpus:
            for dv in prefs.devices:
                dv.use = dv.type == dev_type
            print('GPU:', dev_type, [dv.name for dv in gpus])
            break
    except Exception as ex:
        print('device', dev_type, ex)
scene.cycles.device = 'GPU'
c = scene.cycles
c.use_adaptive_sampling = True
c.adaptive_threshold = 0.012
c.samples = {'full': 192, 'still': 512}.get(MODE, 128)
c.use_denoising = True
try:
    c.denoiser = 'OPTIX'
except Exception:
    pass
c.max_bounces = 10
c.transparent_max_bounces = 48
c.volume_bounces = 2
c.volume_step_rate = 1.0
c.caustics_reflective = False
c.caustics_refractive = False
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.5
scene.render.use_persistent_data = True
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.resolution_percentage = 50 if MODE == 'test' else 100
try:
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'

import time
if MODE in ('test', 'still'):
    scene.frame_set(TEST_FRAME)
    scene.render.filepath = os.path.join(OUT, 'still_frame.png' if MODE == 'still' else 'test_frame.png')
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print('RENDERTIJD %.1f s' % (time.time() - t0))
else:
    scene.render.filepath = os.path.join(OUT, 'frame_')
    bpy.ops.render.render(animation=True)
print('KLAAR')
