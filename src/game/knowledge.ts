// Knowledge Center entries. Science is simplified for young learners; each card says
// what the game simplifies, so players can tell game rules from real engineering.

import { CARDS_MY } from '../i18n/cards-my';

export interface Card {
  id: string;
  title: string;
  icon: string;
  body: string[];
  inGame: string;
  source: string;
}

export const CARDS: Record<string, Card> = {
  gravity: {
    id: 'gravity',
    title: 'Lunar gravity',
    icon: '🪶',
    body: [
      "Gravity on the Moon is 1.62 m/s², about one sixth of Earth's 9.81 m/s². If you weigh 36 kg on Earth, the Moon pulls on you like 6 kg.",
      'Your mass does not change, only your weight. A heavy suit is still hard to stop once it is moving, so astronauts learned to take slow, bouncy steps.',
    ],
    inGame: 'Your jumps rise about 1.4 m and last over 2 seconds. Real suits are stiffer, so real jumps are lower.',
    source: 'NASA Moon facts (science.nasa.gov/moon)',
  },
  vacuum: {
    id: 'vacuum',
    title: 'No air, no sound, black sky',
    icon: '🔇',
    body: [
      'The Moon has almost no atmosphere, so there is no air to breathe and nothing to carry sound. Outside, you only hear your own suit: fans, radio and breathing.',
      'Without air to scatter sunlight, the sky stays black even when the Sun is up. In photos the bright ground usually hides the stars, but your eyes can see them in shadow.',
    ],
    inGame: 'Your suit supplies oxygen and pressure. It runs out faster here than in a real suit, which lasts about 8 hours.',
    source: 'NASA: The Moon’s exosphere',
  },
  earth: {
    id: 'earth',
    title: 'Earth from the Moon',
    icon: '🌍',
    body: [
      "Earth is about 384,400 km away. From the Moon it looks about 2° wide, nearly 4 times wider than the full Moon looks from Earth.",
      'The Moon always shows the same side to Earth, so from the near side Earth stays in almost the same place in the sky. It only wobbles a little. At the south pole it hangs just above the horizon.',
    ],
    inGame: 'Earth shows phases like the Moon does. Its lit side always faces the Sun.',
    source: 'NASA Moon facts; LRO "Earthrise" imagery',
  },
  regolith: {
    id: 'regolith',
    title: 'Regolith: Moon dust',
    icon: '🌑',
    body: [
      'Regolith is the layer of crushed rock and dust that covers the Moon. Billions of years of meteorite impacts made it.',
      'There is no wind or water to wear the grains down, so they stay sharp and jagged. Moon dust clings to suits and can scratch visors and jam machines. Apollo crews found it everywhere.',
    ],
    inGame: 'The ground textures in this game are scans of lunar regolith simulant.',
    source: 'NASA: Lunar regolith / Apollo experience reports',
  },
  temperature: {
    id: 'temperature',
    title: 'Extreme temperatures',
    icon: '🌡️',
    body: [
      'With no air to spread heat around, sunlit ground near the equator reaches about 120 °C, and at night it drops to about −130 °C.',
      'Near the poles the Sun stays low. Some crater floors never see sunlight at all, and they are among the coldest places measured in the Solar System, below −240 °C.',
    ],
    inGame: 'Your suit keeps you at about 21 °C. The outside reading is a simplified local surface temperature.',
    source: 'NASA LRO Diviner measurements',
  },
  radiation: {
    id: 'radiation',
    title: 'Space radiation',
    icon: '☢️',
    body: [
      'Earth’s magnetic field and thick air shield us from fast particles from the Sun and deep space. The Moon has neither.',
      'In 2019 China’s Chang’e 4 lander measured about 1.4 millisieverts per day on the lunar surface. That is roughly 200 times the natural dose on Earth’s surface. Piling regolith over a habitat can block much of it.',
    ],
    inGame: 'Your dosimeter adds up radiation using the measured surface rate, sped up with game time.',
    source: 'Zhang et al., Science Advances (2020)',
  },
  southpole: {
    id: 'southpole',
    title: 'Why the south pole?',
    icon: '🧭',
    body: [
      'NASA’s Artemis missions aim for the lunar south pole. Some high ridges there get sunlight most of the time, which is good for solar power.',
      'Nearby craters that never see the Sun hold water ice. Ice can become drinking water, oxygen to breathe, and even rocket fuel.',
    ],
    inGame: 'This outpost sits on a sunny ridge. The tall solar arrays stand upright to catch the low Sun.',
    source: 'NASA Artemis: lunar south pole regions',
  },
  lifesupport: {
    id: 'lifesupport',
    title: 'Life support',
    icon: '🫁',
    body: [
      'A life support system keeps the air, water and temperature inside a habitat safe. Without it, astronauts could survive only minutes on the Moon.',
      'Each astronaut uses roughly 0.8 kg of oxygen and several litres of water every day. Bringing all of that from Earth would be very expensive, so long missions make and recycle as much as they can.',
    ],
    inGame: 'Your outpost uses one combined life support unit. Real stations split the jobs across several racks.',
    source: 'NASA Life Support Baseline Values and Assumptions Document',
  },
  electrolysis: {
    id: 'electrolysis',
    title: 'Making oxygen from water',
    icon: '⚡',
    body: [
      'The oxygen generator uses electrolysis: electricity splits water (H₂O) into hydrogen (H₂) and oxygen (O₂). The International Space Station makes most of its oxygen this way.',
      'On the Moon, water could come from ice hidden in cold, shadowed craters. Oxygen can also be pulled out of the regolith itself, which is about 40% oxygen by weight, locked inside minerals.',
    ],
    inGame: 'The generator fills the habitat in seconds. A real one takes much longer.',
    source: 'NASA ISS Oxygen Generation System',
  },
  water: {
    id: 'water',
    title: 'Recycling every drop',
    icon: '💧',
    body: [
      "On the ISS, the Water Recovery System cleans sweat, breath moisture and even urine back into drinking water. In 2023 it reached a 98% recovery rate.",
      'Recycling matters because resupply from Earth is slow and costly. The more water a base recovers, the longer the crew can stay.',
    ],
    inGame: 'A clogged filter stopped recovery here. Moon dust getting into machines is a real worry for engineers.',
    source: 'NASA (2023): ISS reaches 98% water recovery',
  },
  air: {
    id: 'air',
    title: 'Safe air to breathe',
    icon: '🌬️',
    body: [
      "Earth's air is about 21% oxygen. Below about 19.5%, people start to tire and think less clearly, so habitats keep oxygen close to Earth levels.",
      'Breathing also adds carbon dioxide (CO₂). Too much makes people sick, so scrubbers remove CO₂ from the air all the time.',
    ],
    inGame: 'The habitat oxygen gauge shows the oxygen share of the cabin air.',
    source: 'NASA ECLSS overview',
  },
  solar: {
    id: 'solar',
    title: 'Solar power on the Moon',
    icon: '☀️',
    body: [
      'Solar cells turn sunlight into electricity. The Moon has no clouds and no air, so sunlight arrives at full strength: about 1,361 watts on every square metre that faces the Sun.',
      'Spacecraft solar cells turn about 30% of that light into electricity; the rest becomes heat. Moon dust on a panel blocks light, so keeping panels clean matters.',
    ],
    inGame: 'Dust never builds up on your panels. On the real Moon, crews would have to keep them clean.',
    source: 'NASA Glenn Research Center: photovoltaics for space; NASA Moon facts',
  },
  vsat: {
    id: 'vsat',
    title: 'Tall towers for a low Sun',
    icon: '🗼',
    body: [
      'At the lunar south pole the Sun never climbs high. It circles low around the horizon, so panels lying flat would catch almost nothing. Instead the panels stand upright on tall masts, above the shadows of rocks and hills.',
      'The Sun goes all the way around the horizon about once every 29.5 days, so the towers slowly turn to keep facing it. Angle matters: facing the Sun straight on gives the most power, and turned 60° away gives only half (cos 60° = 0.5).',
    ],
    inGame: "Each tower makes up to 10 kW, like NASA's Vertical Solar Array Technology (VSAT) designs. The game's Sun sits higher than the real polar Sun, which stays within about 1.5° of the horizon.",
    source: 'NASA Space Technology Mission Directorate: Vertical Solar Array Technology (VSAT)',
  },
  battery: {
    id: 'battery',
    title: 'Storing energy for later',
    icon: '🔋',
    body: [
      'Solar towers only make power while sunlight reaches them. Batteries store extra energy when there is plenty and give it back when there is none.',
      'Power and energy are different. Power (kilowatts, kW) is how fast energy flows, like water from a tap. Energy (kilowatt-hours, kWh) is how much is stored, like water in a bucket. A 100 kWh battery can run a 5 kW load for 20 hours.',
    ],
    inGame: 'Your battery bank stores 100 kWh and never wears out. Real lithium-ion batteries slowly lose capacity and must be kept warm in the cold lunar night.',
    source: 'NASA Glenn Research Center: energy storage for space missions',
  },
  powerbudget: {
    id: 'powerbudget',
    title: 'The power budget',
    icon: '📋',
    body: [
      'Engineers list every machine, how much power it needs and how long it runs. This "power budget" shows whether there is enough energy, especially when no new energy is coming in.',
      'Life support, heating and the radio to Earth come first: the crew cannot survive without them. Floodlights, science work and charging the rover can wait until the Sun returns.',
    ],
    inGame: 'Each system is simply on or off. Real outposts can also turn things down partly and plan days ahead.',
    source: 'NASA Systems Engineering Handbook (technical resource budgets)',
  },
  lunarnight: {
    id: 'lunarnight',
    title: 'Lunar day and night',
    icon: '🌗',
    body: [
      'The Moon turns once every 29.5 Earth days, so most places get about two weeks of sunlight followed by about two weeks of darkness. In the lunar night the ground cools to about −130 °C.',
      'Near the south pole the Sun skims the horizon. Some high ridges are sunlit most of the year, while nearby hills and craters leave other places in shadow. That is one reason NASA wants to land there.',
    ],
    inGame: 'Here the Sun sinks much faster and lower than it really would, and the dark spell lasts only about 10 hours.',
    source: 'NASA Moon facts; Lunar Reconnaissance Orbiter illumination studies',
  },
};

/** The card in the current UI language (Burmese falls back to English per field). */
export function cardFor(id: string, lang: 'en' | 'my'): Card | undefined {
  const c = CARDS[id];
  if (!c || lang === 'en') return c;
  const m = CARDS_MY[id];
  return m ? { ...c, title: m.title, body: m.body, inGame: m.inGame } : c;
}
