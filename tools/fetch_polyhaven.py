"""Download CC0 Poly Haven assets (textures as JPG maps, models as glTF) into public/assets/polyhaven."""
import json, os, subprocess, sys

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'polyhaven')
UA = 'JuniorAstronaut-dev'


def curl_json(url):
    return json.loads(subprocess.check_output(['curl', '-sSL', '-m', '60', '-A', UA, url]))


def curl_file(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.check_call(['curl', '-sSL', '-m', '300', '-A', UA, '-o', path, url])


def texture(asset, res, maps=('Diffuse', 'nor_gl', 'Rough', 'Displacement')):
    files = curl_json(f'https://api.polyhaven.com/files/{asset}')
    for m in maps:
        if m not in files:
            print('  missing map', asset, m)
            continue
        f = files[m][res]['jpg' if 'jpg' in files[m][res] else 'png']
        name = os.path.basename(f['url'])
        curl_file(f['url'], os.path.join(OUT, 'textures', asset, name))
        print('  ', name, f['size'])


def model(asset, res):
    files = curl_json(f'https://api.polyhaven.com/files/{asset}')
    g = files['gltf'][res]['gltf']
    base = os.path.join(OUT, 'models', asset)
    curl_file(g['url'], os.path.join(base, os.path.basename(g['url'])))
    for rel, inc in g.get('include', {}).items():
        curl_file(inc['url'], os.path.join(base, rel))
    print('  ', asset, 'gltf +', len(g.get('include', {})), 'files')


if __name__ == '__main__':
    only = sys.argv[1:]
    for a in ['moon_01', 'moon_dusted_02', 'moon_meteor_02', 'moon_track_01', 'moon_footprints_01']:
        if only and a not in only:
            continue
        print(a); texture(a, '1k')
    for r in ['moon_rock_01', 'moon_rock_03', 'moon_rock_05', 'moon_rock_07']:
        if only and r not in only:
            continue
        model(r, '1k')
