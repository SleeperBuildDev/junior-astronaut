// Knowledge Center entries. Science is simplified for young learners; each card says
// what the game simplifies, so players can tell game rules from real engineering.

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
};
