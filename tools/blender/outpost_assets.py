"""Builds the outpost's hero models in Blender and exports one GLB per asset.

Run headless:
  blender.exe -b --factory-startup --python tools/blender/outpost_assets.py -- <out_dir> [asset ...]

Blender is Z-up; the glTF exporter converts to three.js Y-up. Each asset's origin is
on the ground (z = 0) at its footprint centre. Long modules run along +X.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.abspath('assets-src/glb')
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- materials

def material(name, color, metal=0.0, rough=0.5, emit=None, strength=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    return m


def mats():
    return {
        'shell': material('Shell', (0.80, 0.80, 0.77), 0.0, 0.55),
        'panel': material('PanelGrey', (0.60, 0.61, 0.62), 0.1, 0.5),
        'seam': material('Seam', (0.22, 0.23, 0.25), 0.3, 0.6),
        'foil': material('Foil', (0.75, 0.55, 0.18), 1.0, 0.32),
        'alu': material('Alu', (0.70, 0.72, 0.75), 0.85, 0.45),
        'dark': material('Dark', (0.06, 0.065, 0.075), 0.6, 0.5),
        'rubber': material('Rubber', (0.03, 0.03, 0.03), 0.0, 0.9),
        'glass': material('Glass', (0.02, 0.04, 0.07), 0.2, 0.05, emit=(1.0, 0.78, 0.5), strength=1.2),
        'hazard': material('Hazard', (0.85, 0.6, 0.05), 0.0, 0.6),
        'white': material('White', (0.86, 0.86, 0.84), 0.0, 0.6),
        'blue': material('Blue', (0.10, 0.30, 0.65), 0.0, 0.45),
        'lamp': material('Lamp', (1, 1, 1), 0.0, 0.3, emit=(1.0, 0.95, 0.85), strength=8.0),
        'radiator': material('Radiator', (0.88, 0.89, 0.9), 0.3, 0.35),
        'tire': material('Tire', (0.42, 0.42, 0.40), 0.9, 0.55),
        'fabric': material('Fabric', (0.86, 0.85, 0.81), 0.0, 0.92),
        'strap': material('Strap', (0.50, 0.50, 0.47), 0.0, 0.8),
    }

# ---------------------------------------------------------------- primitives

def _finish(obj, mat, name, bevel=0.0, segments=2):
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if name:
        obj.name = name
    if bevel > 0:
        b = obj.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'ANGLE'
        b.harden_normals = True
    obj.modifiers.new('WN', 'WEIGHTED_NORMAL').keep_sharp = True
    return obj


def box(size, loc, mat, rot=(0, 0, 0), bevel=0.015, name=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, mat, name, bevel)


def cyl(r, depth, loc, mat, rot=(0, 0, 0), verts=32, bevel=0.0, name=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _finish(o, mat, name, bevel)


def sphere(r, loc, mat, scale=(1, 1, 1), segs=32, name=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    return _finish(o, mat, name)


def torus(major, minor, loc, mat, rot=(0, 0, 0), major_seg=48, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_seg, minor_segments=minor_seg, location=loc, rotation=rot)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _finish(o, mat, None)


def tube(points, r, mat, res=6):
    curve = bpy.data.curves.new('tube', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = r
    curve.bevel_resolution = 2
    sp = curve.splines.new('POLY' if len(points) == 2 else 'NURBS')
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (*p, 1)
    if len(points) > 2:
        sp.order_u = min(4, len(points))
        sp.use_endpoint_u = True
        sp.resolution_u = res
    o = bpy.data.objects.new('tube', curve)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _finish(o, mat, None)


def strut(a, b, r, mat, verts=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    o = cyl(r, d.length, (a + b) / 2, mat, verts=verts)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o

# ---------------------------------------------------------------- assets

def habitat_module(M, length=9.0, radius=2.1, lab=False):
    lift = radius + 0.9
    # pressure shell, made of panels separated by recessed seams
    n_panels = 6
    seg = (length - 0.1) / n_panels
    for i in range(n_panels):
        x = -length / 2 + 0.05 + seg * (i + 0.5)
        cyl(radius, seg - 0.06, (x, 0, lift), M['shell'], rot=(0, math.pi / 2, 0), verts=64, bevel=0.02)
        cyl(radius - 0.03, 0.08, (x + seg / 2, 0, lift), M['seam'], rot=(0, math.pi / 2, 0), verts=64)
        # raised stringers on the upper half
        for k in range(-3, 4):
            a = math.radians(90 + k * 22)
            box((seg - 0.3, 0.06, 0.035), (x, math.cos(a) * (radius + 0.015), lift + math.sin(a) * (radius + 0.015)), M['panel'], rot=(a - math.pi / 2, 0, 0), bevel=0.008)
    # end domes and docking rings
    for s in (-1, 1):
        d = sphere(radius, (s * length / 2, 0, lift), M['shell'], scale=(0.34, 1, 1), segs=48)
        torus(radius - 0.02, 0.07, (s * (length / 2 - 0.02), 0, lift), M['alu'], rot=(0, math.pi / 2, 0), major_seg=64)
        torus(0.95, 0.08, (s * (length / 2 + radius * 0.32), 0, lift), M['dark'], rot=(0, math.pi / 2, 0), major_seg=48)
        cyl(0.9, 0.06, (s * (length / 2 + radius * 0.33), 0, lift), M['panel'], rot=(0, math.pi / 2, 0), verts=40)
    # MLI belly blanket (gold foil) with quilting lines
    belly = cyl(radius + 0.02, length * 0.9, (0, 0, lift), M['foil'], rot=(0, math.pi / 2, 0), verts=64)
    bpy.ops.object.transform_apply(rotation=True)  # so vertex z is height, not the cylinder axis
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in belly.data.vertices:
        v.select = v.co.z > -radius * 0.05  # keep the lower part only
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i in range(7):
        x = -length * 0.42 + i * length * 0.14
        torus(radius + 0.025, 0.012, (x, 0, lift), M['dark'], rot=(0, math.pi / 2, 0), major_seg=64, minor_seg=4)
    # windows with frames and sun hoods
    for side in (-1, 1):
        for x in (-length * 0.24, 0.0 if lab else length * 0.24):
            y = side * (radius - 0.02)
            cyl(0.34, 0.12, (x, y, lift + 0.35), M['glass'], rot=(math.pi / 2, 0, 0), verts=32)
            torus(0.36, 0.06, (x, y + side * 0.05, lift + 0.35), M['dark'], rot=(math.pi / 2, 0, 0), major_seg=32)
            box((0.9, 0.16, 0.05), (x, y + side * 0.14, lift + 0.82), M['panel'], bevel=0.01)
    # handrails on standoffs, both sides
    for side in (-1, 1):
        y = side * (radius + 0.22)
        z = lift - 0.35
        tube([(-length / 2 + 0.6, y, z), (length / 2 - 0.6, y, z)], 0.025, M['hazard'])
        for x in [-length / 2 + 0.6 + i * (length - 1.2) / 4 for i in range(5)]:
            strut((x, side * radius * 0.94, z), (x, y, z), 0.018, M['alu'])
    # utility tray with pipe bundle on the roof
    top = lift + radius
    box((length * 0.8, 0.9, 0.06), (0, 0, top + 0.08), M['dark'], bevel=0.01)
    for k, (yy, mat_key, r) in enumerate([(-0.3, 'alu', 0.05), (-0.12, 'foil', 0.045), (0.06, 'alu', 0.035), (0.24, 'blue', 0.04)]):
        tube([(-length * 0.4, yy, top + 0.17 + r), (length * 0.4, yy, top + 0.17 + r)], r, M[mat_key])
    for x in (-length * 0.3, 0, length * 0.3):
        box((0.1, 0.95, 0.2), (x, 0, top + 0.2), M['alu'], bevel=0.01)
    # roof radiator panel or lab science dome
    if lab:
        sphere(0.75, (length * 0.15, 0, top + 0.2), M['glass'], scale=(1, 1, 0.6), segs=32)
        torus(0.76, 0.06, (length * 0.15, 0, top + 0.2), M['alu'])
        cyl(0.06, 1.6, (-length * 0.3, 0.6, top + 0.9), M['alu'], verts=8)
        sphere(0.12, (-length * 0.3, 0.6, top + 1.7), M['white'], segs=16)
    else:
        for i in range(10):
            box((0.05, 1.6, 0.9), (-length * 0.3 + i * 0.16, -0.0, top + 0.75), M['radiator'], bevel=0.005)
        box((1.7, 0.08, 0.08), (-length * 0.3 + 0.72, 0, top + 0.28), M['alu'])
    # exterior light fixtures
    for x in (-length * 0.35, length * 0.35):
        for side in (-1, 1):
            box((0.22, 0.1, 0.1), (x, side * (radius + 0.06), lift + radius * 0.62), M['dark'], bevel=0.01)
            box((0.16, 0.02, 0.06), (x, side * (radius + 0.115), lift + radius * 0.62), M['lamp'])
    # legs: truss pairs with footpads
    for x in (-length * 0.32, length * 0.32):
        for side in (-1, 1):
            foot = (x, side * radius * 0.85, 0.08)
            strut(foot, (x - 0.35, side * radius * 0.55, lift - radius * 0.8), 0.07, M['alu'])
            strut(foot, (x + 0.35, side * radius * 0.55, lift - radius * 0.8), 0.07, M['alu'])
            cyl(0.32, 0.1, (foot[0], foot[1], 0.05), M['dark'], verts=20, bevel=0.01)
        strut((x, -radius * 0.55, lift - radius * 0.8), (x, radius * 0.55, lift - radius * 0.8), 0.06, M['alu'])


def node_module(M, radius=2.0):
    lift = 3.0
    sphere(radius, (0, 0, lift), M['shell'], segs=48)
    for a in range(0, 360, 30):
        r = math.radians(a)
        torus(radius * 0.99, 0.018, (0, 0, lift), M['seam'], rot=(math.pi / 2, 0, r), major_seg=64, minor_seg=4)
    for rot, loc in [((0, math.pi / 2, 0), (-radius, 0, lift)), ((math.pi / 2, 0, 0), (0, -radius, lift)), ((0, math.pi / 2, 0), (radius, 0, lift))]:
        cyl(1.1, 0.7, loc, M['alu'], rot=rot, verts=40, bevel=0.02)
        torus(1.12, 0.07, loc, M['dark'], rot=rot, major_seg=48)
    torus(radius * 0.86, 0.09, (0, 0, lift - radius * 0.5), M['foil'], major_seg=64)
    for a in range(4):
        r = math.radians(45 + a * 90)
        strut((math.cos(r) * 1.9, math.sin(r) * 1.9, 0.08), (math.cos(r) * 1.0, math.sin(r) * 1.0, lift - radius * 0.85), 0.07, M['alu'])
        cyl(0.3, 0.1, (math.cos(r) * 1.9, math.sin(r) * 1.9, 0.05), M['dark'], verts=20)


def wheel(M, loc, radius=0.42, width=0.28, side=1):
    x, y, z = loc
    cyl(radius, width, loc, M['tire'], rot=(math.pi / 2, 0, 0), verts=32, bevel=0.03)
    # mesh-tyre treads (chevrons) like the Apollo LRV wire wheels
    for i in range(24):
        a = i * math.tau / 24
        box((0.06, width * 1.02, 0.03), (x + math.cos(a) * radius, y, z + math.sin(a) * radius), M['dark'], rot=(0, -a + math.pi / 2, 0), bevel=0.0)
    cyl(radius * 0.45, width + 0.04, loc, M['alu'], rot=(math.pi / 2, 0, 0), verts=20)
    cyl(0.08, 0.2, (x, y + side * 0.2, z), M['dark'], rot=(math.pi / 2, 0, 0), verts=12)


def rover(M):
    L, W, H = 3.6, 2.1, 0.85
    box((L, W * 0.86, 0.12), (0, 0, H), M['alu'], bevel=0.02)
    for x in (-L / 2 + 0.1, L / 2 - 0.1):
        box((0.12, W, 0.18), (x, 0, H - 0.05), M['dark'], bevel=0.02)
    for y in (-W * 0.42, W * 0.42):
        box((L, 0.1, 0.16), (0, y, H - 0.04), M['dark'], bevel=0.02)
    for x in (-L * 0.36, L * 0.36):
        for s in (-1, 1):
            wheel(M, (x, s * (W / 2 + 0.1), 0.42), side=s)
            box((0.95, 0.38, 0.04), (x, s * (W / 2 + 0.12), 0.95), M['foil'], bevel=0.01)
            strut((x, s * W * 0.4, H - 0.05), (x, s * (W / 2 - 0.02), 0.42), 0.05, M['alu'])
    # two seats
    for y in (-0.48, 0.48):
        box((0.6, 0.62, 0.08), (0.15, y, H + 0.35), M['blue'], bevel=0.03)
        box((0.08, 0.62, 0.6), (-0.15, y, H + 0.62), M['blue'], rot=(0, -0.25, 0), bevel=0.03)
        for x in (-0.05, 0.4):
            strut((x, y, H + 0.06), (x, y, H + 0.32), 0.03, M['alu'])
    # control console between the seats with a screen
    box((0.5, 0.3, 0.5), (0.75, 0, H + 0.3), M['dark'], bevel=0.03)
    box((0.02, 0.24, 0.16), (1.0, 0, H + 0.48), M['glass'])
    # battery and electronics boxes front/back, antenna and camera mast
    box((0.7, 1.4, 0.45), (1.35, 0, H + 0.28), M['white'], bevel=0.04)
    box((0.9, 1.5, 0.4), (-1.3, 0, H + 0.26), M['white'], bevel=0.04)
    box((0.92, 1.52, 0.04), (-1.3, 0, H + 0.48), M['radiator'])
    strut((-1.55, 0.55, H + 0.46), (-1.55, 0.55, H + 1.9), 0.025, M['alu'])
    cyl(0.32, 0.05, (-1.55, 0.55, H + 1.95), M['white'], rot=(0.5, 0, 0), verts=24, r2=0.05)
    strut((1.55, -0.5, H + 0.5), (1.55, -0.5, H + 1.45), 0.03, M['alu'])
    box((0.18, 0.3, 0.14), (1.58, -0.5, H + 1.52), M['dark'], bevel=0.02)
    box((0.02, 0.1, 0.08), (1.68, -0.5, H + 1.52), M['glass'])
    # headlights
    for y in (-0.6, 0.6):
        box((0.06, 0.2, 0.1), (L / 2 + 0.02, y, H + 0.12), M['lamp'])
    # handholds
    tube([(0.5, -W * 0.45, H + 0.1), (0.5, -W * 0.45, H + 0.45), (1.0, -W * 0.45, H + 0.45)], 0.02, M['alu'])
    tube([(0.5, W * 0.45, H + 0.1), (0.5, W * 0.45, H + 0.45), (1.0, W * 0.45, H + 0.45)], 0.02, M['alu'])


def floodlight(M, height=6.0):
    for a in range(3):
        r = math.radians(a * 120)
        strut((math.cos(r) * 1.0, math.sin(r) * 1.0, 0.0), (0, 0, height * 0.35), 0.05, M['alu'])
        cyl(0.18, 0.06, (math.cos(r) * 1.0, math.sin(r) * 1.0, 0.03), M['dark'], verts=16)
    cyl(0.07, height, (0, 0, height / 2), M['alu'], verts=12)
    box((0.35, 0.35, 0.5), (0, 0, height * 0.35), M['white'], bevel=0.03)
    box((0.22, 1.1, 0.1), (0, 0, height + 0.05), M['dark'], bevel=0.02)
    for y in (-0.36, 0.0, 0.36):
        box((0.32, 0.3, 0.28), (0.12, y, height - 0.12), M['dark'], rot=(0, 0.45, 0), bevel=0.03)
        box((0.02, 0.24, 0.22), (0.29, y, height - 0.2), M['lamp'], rot=(0, 0.45, 0))


def power_unit(M):
    """Power distribution unit with battery racks and a radiator wing."""
    box((2.6, 1.4, 1.3), (0, 0, 0.75), M['white'], bevel=0.05)
    box((2.62, 1.42, 0.12), (0, 0, 1.25), M['hazard'], bevel=0.01)
    for i in range(6):
        box((0.36, 0.04, 0.9), (-1.05 + i * 0.42, -0.72, 0.7), M['dark'], bevel=0.01)
    box((0.5, 0.05, 0.3), (0.9, 0.72, 0.9), M['glass'])
    for x in (-1.1, 1.1):
        for y in (-0.55, 0.55):
            cyl(0.08, 0.12, (x, y, 0.06), M['dark'], verts=12)
    for i in range(8):
        box((0.04, 1.8, 1.2), (-0.9 + i * 0.26, 0, 2.2), M['radiator'], bevel=0.004)
    box((2.0, 0.1, 0.1), (0, 0, 1.6), M['alu'])
    for x in (-0.9, 0.9):
        strut((x, 0, 1.4), (x, 0, 1.6), 0.04, M['alu'])
    for y in (-0.3, 0.3):
        tube([(1.3, y, 0.4), (1.7, y, 0.15), (2.1, y, 0.05)], 0.05, M['rubber'])


def battery_bank(M):
    """Battery storage: four insulated lithium-ion cabinets on a skid, with radiator fins
    on top (batteries must be kept warm at night and cool while charging) and cable trays.
    The front faces -Y (glTF +Z); the game adds glowing charge bars on each door."""
    box((3.9, 1.7, 0.22), (0, 0, 0.11), M['dark'], bevel=0.03)
    for x in (-1.75, 1.75):
        for y in (-0.7, 0.7):
            cyl(0.1, 0.1, (x, y, 0.05), M['dark'], verts=12)
    for i in range(4):
        x = -1.35 + i * 0.9
        box((0.82, 1.3, 1.55), (x, 0, 1.0), M['white'], bevel=0.035)
        # door with a recessed frame and a handle
        box((0.66, 0.03, 1.32), (x, -0.66, 1.0), M['panel'], bevel=0.01)
        box((0.04, 0.05, 0.3), (x + 0.26, -0.69, 1.05), M['alu'], bevel=0.008)
        # cell-module rows behind a vent grille
        for k in range(5):
            box((0.5, 0.02, 0.03), (x - 0.05, -0.68, 0.45 + k * 0.08), M['seam'])
        # gold thermal blanket on the sides of the end cabinets
        if i in (0, 3):
            box((0.02, 1.2, 1.4), (x + (-0.42 if i == 0 else 0.42), 0, 1.0), M['foil'])
        # radiator fins on the roof
        for f in range(5):
            box((0.7, 0.03, 0.18), (x, -0.5 + f * 0.25, 1.88), M['radiator'], bevel=0.004)
        box((0.78, 1.2, 0.04), (x, 0, 1.79), M['alu'])
    # cable tray along the back and a conduit to the power unit
    box((3.6, 0.22, 0.12), (0, 0.78, 0.5), M['alu'], bevel=0.01)
    for y in (0.72, 0.84):
        tube([(1.8, y, 0.5), (2.2, y, 0.35), (2.6, y, 0.08)], 0.04, M['rubber'])
    # warning placard
    box((0.5, 0.02, 0.18), (-1.35, -0.68, 1.62), M['hazard'])


def inflatable_hab(M, length=8.0, radius=2.4):
    """Inflatable habitat shell (after NASA TransHab / BEAM): layered fabric held in shape
    by restraint straps, with rigid metal bulkheads at both ends. Axis along X, centred
    on the origin; the game scales it from packed to inflated about the north (-X) end."""
    cap = radius * 0.5
    body = length - 2 * cap
    cyl(radius, body, (0, 0, 0), M['fabric'], rot=(0, math.pi / 2, 0), verts=72)
    for s in (-1, 1):
        sphere(radius, (s * body / 2, 0, 0), M['fabric'], scale=(cap / radius, 1, 1), segs=56)
        # rigid bulkhead ring and hatch plate at each end
        torus(radius * 0.42, 0.09, (s * (body / 2 + cap * 0.93), 0, 0), M['alu'], rot=(0, math.pi / 2, 0), major_seg=48)
        cyl(radius * 0.4, 0.08, (s * (body / 2 + cap * 0.95), 0, 0), M['panel'], rot=(0, math.pi / 2, 0), verts=40)
    # hoop straps around the body
    for i in range(9):
        x = -body / 2 + i * body / 8
        torus(radius + 0.015, 0.03, (x, 0, 0), M['strap'], rot=(0, math.pi / 2, 0), major_seg=72, minor_seg=6)
    # long straps running end to end
    for k in range(10):
        a = math.radians(k * 36 + 18)
        box((body, 0.07, 0.025), (0, math.cos(a) * (radius + 0.012), math.sin(a) * (radius + 0.012)), M['strap'], rot=(a - math.pi / 2, 0, 0), bevel=0.0)
    # windows with frames and covers
    for side in (-1, 1):
        for x in (-body * 0.25, body * 0.25):
            y = side * (radius - 0.03)
            cyl(0.3, 0.12, (x, y, 0.45), M['glass'], rot=(math.pi / 2, 0, 0), verts=32)
            torus(0.33, 0.06, (x, y + side * 0.05, 0.45), M['dark'], rot=(math.pi / 2, 0, 0), major_seg=32)
    # micrometeoroid "bumper" seams: a few quilting lines between straps
    for i in range(8):
        x = -body / 2 + body / 16 + i * body / 8
        torus(radius + 0.005, 0.008, (x, 0, 0), M['seam'], rot=(0, math.pi / 2, 0), major_seg=72, minor_seg=4)


ASSETS = {
    'inflatable_hab': inflatable_hab,    'battery_bank': battery_bank,
    'hab_module': lambda M: habitat_module(M, 9.0, 2.1, lab=False),
    'lab_module': lambda M: habitat_module(M, 8.0, 1.9, lab=True),
    'node_module': node_module,
    'rover': rover,
    'floodlight': floodlight,
    'power_unit': power_unit,
}

# ---------------------------------------------------------------- build & export

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for d in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(d):
            d.remove(item)


def render_preview(name):
    scn = bpy.context.scene
    objs = [o for o in scn.objects if o.type == 'MESH']
    lo = Vector((min(o.bound_box[i][0] + o.location.x for o in objs for i in range(8)), 0, 0))
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (mn + mx) / 2
    size = (mx - mn).length
    cam_data = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_data)
    scn.collection.objects.link(cam)
    cam.location = center + Vector((size * 0.75, -size * 0.95, size * 0.45))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scn.camera = cam
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 5
    sun = bpy.data.objects.new('sun', sun_data)
    sun.rotation_euler = (math.radians(65), 0, math.radians(35))
    scn.collection.objects.link(sun)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.02, 0.025, 1)
    scn.world = world
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = 640, 400
    scn.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun):
        bpy.data.objects.remove(o)


for name, build in ASSETS.items():
    if ONLY and name not in ONLY:
        continue
    reset()
    M = mats()
    build(M)
    # apply modifiers and join into one object (one mesh, one primitive per material)
    bpy.ops.object.select_all(action='SELECT')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    render_preview(name)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True)
    print('ASSET', name, 'tris', tris, 'bytes', os.path.getsize(os.path.join(OUT, name + '.glb')))
