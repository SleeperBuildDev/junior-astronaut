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
    'cs_intro_1': "The lunar south pole. Day one of a thirty day mission.",
    'cs_intro_2': "Four days after leaving Earth, the crew's lander begins its final descent.",
    'cs_intro_3': "Touchdown. Moon dust sprays out in perfect arcs. With no air on the Moon, nothing slows it down.",
    'cs_intro_4': "Junior Astronaut, your first steps on the Moon are waiting.",
    'cs_m1_end': "The airlock seals behind you. Outside, your first footprints will stay in the dust for millions of years. There is no wind to blow them away.",
    'cs_m2_intro_1': "Day two. The outpost is waking up. But the habitat air is thin, and the water tank is running low.",
    'cs_m2_intro_2': "Before the crew can live here, life support must come online.",
    'cs_m2_end': "Oxygen is flowing. Water is being recycled. The habitat can breathe. The outpost is alive.",
    'm3_01': "Mission three. Life support is running, but only on the lander's batteries, and they are nearly flat. Head to the power unit north-east of the habitat.",
    'm3_02': "Good. Open the power terminal and check the power system.",
    'm3_03': "The three solar towers are still folded up from the landing. Walk to each one, deploy it, and turn it to face the Sun.",
    'm3_04': "Tower one is making power. Did you see the output drop when the panels did not face the Sun straight on? Two more to go.",
    'm3_05': "All three towers are tracking the Sun. Now go back to the power unit and hold E on the main switch to connect them to the outpost.",
    'm3_06': "Power connected. The towers are charging the batteries. We have sped up time so you can watch. Charge them to sixty percent.",
    'm3_07': "Batteries at sixty percent. Heads up. The Sun will soon drop below the horizon for about ten hours. No sunlight means no solar power. Open the power terminal and make a plan so the batteries last until sunrise.",
    'm3_08': "Good plan. Only the systems we need stay on. Here comes the dark. Press F for your helmet lamp.",
    'm3_09': "Sunrise! The towers are tracking the Sun again and the batteries are recharging. Mission three complete. The outpost has its own power now.",
    'm3_10': "Tower locked on and tracking the Sun. Keep going.",
    'cs_m3_intro_1': "Day three. The air is good and the water is clean. But the outpost is running on the lander's batteries, and they are almost empty.",
    'cs_m3_intro_2': "On the ridge, three solar towers stand folded, still packed up from the landing. Today they must wake up.",
    'cs_m3_end': "The Sun climbs back over the horizon. Three towers turn to meet it. For the first time, the outpost makes its own power.",
}

k = Kokoro(MODEL, VOICES)
os.makedirs(OUT, exist_ok=True)
import sys
only = sys.argv[1:]
for key, text in LINES.items():
    if only and key not in only:
        continue
    # Cutscene narration uses a different, calmer voice than Mission Control.
    narrator = key.startswith('cs_')
    audio, sr = k.create(text, voice='af_heart' if narrator else 'am_michael', speed=0.92 if narrator else 0.95, lang='en-us')
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, key + '.wav')
        sf.write(wav, audio, sr)
        subprocess.check_call(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
                               '-af', 'loudnorm=I=-18:TP=-2', '-ac', '1', '-b:a', '64k',
                               os.path.join(OUT, key + '.mp3')])
    print(key, round(len(audio) / sr, 1), 's')
