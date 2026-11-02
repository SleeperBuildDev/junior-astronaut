"""Render Mission Control voice lines with Kokoro (local, free) -> mono MP3 in public/assets/audio/vo.
Run with the kokoro venv: C:/Users/MyPC/tools/venvs/kokoro/Scripts/python.exe tools/make_vo.py"""
import os, subprocess, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

MODEL = r'C:/Users/MyPC/tools/downloads/kokoro/kokoro-v1.0.onnx'
VOICES = r'C:/Users/MyPC/tools/downloads/kokoro/voices-v1.0.bin'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'audio', 'vo')

LINES = {
    'm1_01': "Junior Astronaut, this is Mission Control. Welcome to the lunar south pole. Take your first steps away from the lander.",
    'm1_02': "Good steps. Gravity here is only one sixth of Earth's. Press Space and try a jump.",
    'm1_03': "Nice and floaty. Now look out toward the horizon. Can you find Earth?",
    'm1_04': "There it is. Home, about three hundred and eighty thousand kilometres away. Follow the flashing beacon to the habitat.",
    'm1_05': "You have reached the outpost. Before you go inside, scan the three environment sensors around the base.",
    'm1_06': "Sensor data received. Keep going.",
    'm1_07': "All sensors scanned. Great work. Head to the airlock on the west end of the habitat.",
    'm1_08': "Airlock pressurising. Mission one complete. Welcome to your new home, Junior Astronaut.",
    'o2_low': "Your suit oxygen is getting low. Head to the oxygen station beside the habitat.",
    'o2_refill': "Suit oxygen refilled. You are good to go.",
    'boundary': "That is the edge of the safe exploration zone. Please head back toward the outpost.",
    'm2_01': "Mission two. The habitat air is thin and the water tank is low. Head to the life support unit on the east side of the habitat.",
    'm2_02': "Good. Open the life support terminal and check which systems are offline.",
    'm2_03': "The oxygen generator is offline. Follow the start-up steps on the terminal to bring it online.",
    'm2_04': "Oxygen generator running. It splits water into oxygen and hydrogen. But it needs water, and the water recycler is blocked.",
    'm2_05': "The recycler filter is clogged with dust. Go to the filter housing and hold E to replace it.",
    'm2_06': "New filter installed. Now start water recovery from the terminal.",
    'm2_07': "Water recovery online. Every drop gets cleaned and used again. Watch the habitat oxygen rise to a safe level.",
    'm2_08': "Habitat air is safe to breathe and the water loop is closed. Mission two complete. Life support is go.",
}

k = Kokoro(MODEL, VOICES)
os.makedirs(OUT, exist_ok=True)
import sys
only = sys.argv[1:]
for key, text in LINES.items():
    if only and key not in only:
        continue
    audio, sr = k.create(text, voice='am_michael', speed=0.95, lang='en-us')
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, key + '.wav')
        sf.write(wav, audio, sr)
        subprocess.check_call(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
                               '-af', 'loudnorm=I=-18:TP=-2', '-ac', '1', '-b:a', '64k',
                               os.path.join(OUT, key + '.mp3')])
    print(key, round(len(audio) / sr, 1), 's')
