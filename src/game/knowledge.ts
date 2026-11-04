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
    icon: '🎈',
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
    icon: '💨',
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
  inflatable: {
    id: 'inflatable',
    title: 'Inflatable habitats',
    icon: '🎈',
    body: [
      'Every kilogram sent to the Moon costs a lot of fuel, so engineers look for light, compact buildings. An inflatable module launches folded up and is filled with air once it arrives, growing to several times its packed size.',
      'In 2016 NASA attached the inflatable BEAM module to the International Space Station. Packed, it was about 2 m long; filled with air it grew to about 4 m. Its wall is many layers thick: an airtight bladder, strong woven straps, and layers that stop tiny meteoroids.',
    ],
    inGame: 'Your module inflates in seconds. A real one is filled slowly and carefully over hours, with many checks along the way.',
    source: 'NASA: Bigelow Expandable Activity Module (BEAM) on the ISS',
  },
  habitat: {
    id: 'habitat',
    title: 'Why a pressurised home?',
    icon: '🏠',
    body: [
      'On the Moon there is almost no air pressure. Without a pressurised habitat or a spacesuit, a person would lose consciousness in about 15 seconds. A habitat keeps air pushing on the body, just as Earth’s atmosphere does.',
      'The ISS keeps its air at 101 kPa, like Earth at sea level. Before spacewalks, the Space Shuttle crew lowered the cabin to about 70 kPa with a little more oxygen, so their bodies adjusted faster to the lower pressure inside a spacesuit. Future Moon bases may do something similar.',
    ],
    inGame: 'The leak check takes a few seconds. Real crews watch the pressure for many hours before trusting a new module.',
    source: 'NASA Human Integration Design Handbook; NASA Exploration Atmospheres Working Group',
  },
  thermal: {
    id: 'thermal',
    title: 'Keeping the right temperature',
    icon: '🌡️',
    body: [
      'Outside, the lunar surface can swing from about 120 °C in sunlight to about −130 °C at night. Inside, the ISS keeps the crew between about 18 and 27 °C.',
      'Habitats use thick insulation blankets to slow heat loss, heaters for cold periods, and radiators that send extra heat away into space. People and machines make heat too, so sometimes a habitat needs cooling more than heating.',
    ],
    inGame: 'The cabin warms up in seconds and only heaters are modelled. Real habitats balance heating and cooling all the time.',
    source: 'NASA: ISS Active Thermal Control System; LRO Diviner measurements',
  },
  sleep: {
    id: 'sleep',
    title: 'Sleeping safely in space',
    icon: '🛏️',
    body: [
      'On the ISS each astronaut has a private crew quarter about the size of a phone booth, with a sleeping bag, a light, a laptop and a fan that keeps fresh air moving. Good sleep keeps the crew healthy, alert and safe.',
      'Water and plastics are rich in hydrogen, which makes them good at blocking space radiation. Engineers have suggested putting water tanks around sleeping areas, since astronauts spend about a third of each day there.',
    ],
    inGame: 'The water walls are a simplified idea. A real base would combine many kinds of shielding.',
    source: 'NASA: ISS crew quarters; NASA research on hydrogen-rich radiation shielding',
  },
  crew: {
    id: 'crew',
    title: 'The crew',
    icon: '👩‍🚀',
    body: [
      'A long Moon mission needs people with different skills. The commander leads and makes the big decisions. The flight engineer keeps the machines running. The scientist studies the Moon. The medical officer looks after everyone’s health.',
      'Astronauts train for years and also learn each other’s jobs, so the crew can still cope if someone is ill or busy. Working well as a team matters as much as technical skill.',
    ],
    inGame: 'Your crew has four people. NASA’s first Artemis landings plan two astronauts on the surface; a future base could host more.',
    source: 'NASA Astronaut Selection and Training; NASA Artemis program',
  },
  cea: {
    id: 'cea',
    title: 'Farming without soil',
    icon: '💧',
    body: [
      'In hydroponics, plant roots grow in water mixed with exactly the nutrients they need, so no soil is required. Everything is controlled: light, temperature, humidity, water and air. Farmers call this controlled-environment agriculture.',
      'It suits the Moon well. Plants breathe out water vapour, which machines can catch and reuse, and they take in carbon dioxide and give back oxygen. The University of Arizona built a Prototype Lunar Greenhouse, an inflatable tube that grows food this way.',
    ],
    inGame: 'Your greenhouse needs only water, light and the right pH. Real systems also manage air flow, temperature, humidity and many separate nutrients.',
    source: 'University of Arizona CEAC: Prototype Lunar Greenhouse; NASA Kennedy plant research',
  },
  light: {
    id: 'light',
    title: 'Light for plants',
    icon: '💡',
    body: [
      'Plants use mostly red and blue light to make their food by photosynthesis. LEDs can give just those colours, wasting little energy, which is why space greenhouses glow pink-purple. NASA’s Veggie garden adds some green light so astronauts can see the plants clearly.',
      'Light is the biggest energy cost of farming in space. Many crops grow well with about 16 hours of light a day; light that never stops can damage some plants, such as tomatoes.',
    ],
    inGame: 'You choose 12, 16 or 24 hours of light. Each choice changes growth speed and power use in a simple way.',
    source: 'NASA: Vegetable Production System (Veggie); NASA Kennedy LED plant lighting research',
  },
  ph: {
    id: 'ph',
    title: 'Nutrients and pH',
    icon: '⚗️',
    body: [
      'pH tells how acidic or basic a liquid is: 7 is neutral, lower is acidic and higher is basic. Most hydroponic crops like their nutrient water slightly acidic, around pH 5.5 to 6.5.',
      'If the pH drifts too high, nutrients such as iron become locked up: they are still in the water, but the roots cannot take them in. Leaves turn yellow even though there is "food" in the tank. Growers check the pH often and add small amounts of acid or base.',
    ],
    inGame: 'One pH problem appears on day 3 and is fixed with a few clicks. In a real greenhouse pH, nutrients and salts drift all the time.',
    source: 'Cornell University CEA: hydroponic nutrient management; NASA plant growth research',
  },
  veggie: {
    id: 'veggie',
    title: 'Gardens in space',
    icon: '🥬',
    body: [
      'NASA’s Veggie garden has flown on the International Space Station since 2014. In 2015 astronauts ate red romaine lettuce grown there, the first time NASA astronauts ate food grown in space. Later crews grew zinnia flowers, cabbage, radishes and even chile peppers.',
      'Microgreens are young seedlings eaten after one to three weeks. They grow fast, need little space and are full of flavour and vitamins, which makes them a good first crop for a new base.',
    ],
    inGame: 'Time speeds up so 8 days pass in about half a minute. The main crops keep growing in later missions.',
    source: 'NASA: Veggie and Advanced Plant Habitat experiments on the ISS',
  },
  foodsystem: {
    id: 'foodsystem',
    title: 'Why grow food on the Moon?',
    icon: '🍽️',
    body: [
      'Each astronaut on the ISS uses about 1.8 kg of food a day, including packaging. For a crew of four that is more than 200 kg every month, all launched from Earth at great cost.',
      'Packaged food also slowly loses some vitamins over the years. Growing food gives fresh vitamins, recycles water and air, cuts what must be sent from Earth, and astronauts say caring for plants makes them feel better too.',
    ],
    inGame: 'Food is counted as "days of food" for the whole crew. The first harvest is small; the greenhouse adds more as the main crops ripen.',
    source: 'NASA Space Food Systems; NASA Human Research Program: food and nutrition',
  },
  magnetosphere: {
    id: 'magnetosphere',
    title: 'Earth’s invisible shield',
    icon: '🧲',
    body: [
      'Earth’s magnetic field bends most charged particles from the Sun and deep space away from the planet. Its air helps too: there are about 10 tonnes of air above every square metre of ground, enough to absorb most of the rest.',
      'The Moon has no global magnetic field and almost no air, so particles hit the surface directly. That is why radiation is one of the biggest dangers for people living on the Moon.',
    ],
    inGame: 'The radiation monitor shows a steady surface rate. In reality it changes slowly with the Sun’s 11-year activity cycle.',
    source: 'NASA: Earth’s magnetosphere; NASA Space Radiation Analysis Group',
  },
  dose: {
    id: 'dose',
    title: 'Measuring radiation',
    icon: '📟',
    body: [
      'Radiation dose is measured in sieverts (Sv), which describe the effect on the human body. A millisievert (mSv) is a thousandth of a sievert. On Earth, people receive about 2 to 3 mSv a year from natural sources.',
      'On the lunar surface the dose is about 1.37 mSv every day, roughly 200 times more than on Earth. NASA limits each astronaut’s whole-career dose to 600 mSv, so every day on the Moon counts.',
    ],
    inGame: 'The readings inside each module are simplified examples, not measurements of real habitats.',
    source: 'Zhang et al., Science Advances (2020); NASA-STD-3001 (career limit, 2022); UNSCEAR',
  },
  shielding: {
    id: 'shielding',
    title: 'Shielding with Moon dirt',
    icon: '🛡️',
    body: [
      'Space radiation comes in two kinds. Galactic cosmic rays are extremely fast particles from exploded stars: a steady drizzle that is very hard to stop. Solar particles come in bursts from the Sun and are easier to block.',
      'Materials rich in hydrogen, like water and plastics, are good shields. Regolith works well too, and it does not need to be launched from Earth. A thick layer of regolith, a metre or more, blocks most solar particles and cuts the cosmic-ray dose a lot.',
    ],
    inGame: 'The berms rise in seconds and halve the dose. Real shielding would be built by robots over weeks, and its effect depends on thickness.',
    source: 'NASA Space Radiation Program; studies of lunar regolith shielding',
  },
  spe: {
    id: 'spe',
    title: 'Solar storms',
    icon: '☀️',
    body: [
      'Sometimes the Sun blasts out huge numbers of protons in a flare or a cloud of material. The fastest ones can reach the Moon within tens of minutes. These solar particle events are rare, but a big one can give a dangerous dose to anyone left unprotected.',
      'Space-weather forecasters watch the Sun all the time and warn crews. In August 1972, between the Apollo 16 and 17 missions, a huge solar storm struck. Luckily, no one was on the Moon at the time.',
    ],
    inGame: 'You get a 2-minute warning and the storm lasts 30 hours. Real warnings and storms vary a lot.',
    source: 'NOAA Space Weather Prediction Center; NASA: solar particle events',
  },
  stormshelter: {
    id: 'stormshelter',
    title: 'Storm shelters',
    icon: '🏚️',
    body: [
      'During a solar storm, astronauts hide in the most shielded place they have. On NASA’s Orion spacecraft the crew builds a shelter by packing storage bags of food, water and supplies around themselves.',
      'On a Moon base the shelter would be a small room deep under regolith and surrounded by water tanks. Crews practise getting there fast, because every minute outside during a storm adds to their dose.',
    ],
    inGame: 'The whole crew shelters in HAB-2, behind the water walls you added in Mission 4 and the regolith you just piled up.',
    source: 'NASA: Orion radiation protection and storm shelter',
  },
  rover: {
    id: 'rover',
    title: 'Driving on the Moon',
    icon: '🚙',
    body: [
      'The Apollo 15, 16 and 17 crews drove an electric Lunar Roving Vehicle. It folded up to fit on the lander, ran on batteries, and had wire-mesh wheels because rubber tyres would not cope with the cold and the sharp dust. The Apollo 17 crew drove about 36 km in total.',
      'In low gravity a rover bounces easily and takes longer to stop, so drivers go slowly around rocks and craters. NASA is now developing a new Lunar Terrain Vehicle for the Artemis missions.',
    ],
    inGame: 'Your rover tops out at about 20 km/h; the Apollo rover managed about 13 km/h. Real rovers also need careful navigation, as there are no roads or GPS on the Moon.',
    source: 'NASA: Apollo Lunar Roving Vehicle; NASA Lunar Terrain Vehicle',
  },
  highlands: {
    id: 'highlands',
    title: 'The Moon’s first crust',
    icon: '🏔️',
    body: [
      'The bright parts of the Moon are the highlands. Their rock, anorthosite, is made mostly of a light mineral called plagioclase feldspar.',
      'Scientists think the young Moon was covered by an ocean of molten rock. As it cooled, light crystals floated to the top and formed the first crust, more than 4 billion years ago. Apollo 15 brought back a piece nicknamed the "Genesis Rock".',
    ],
    inGame: 'You identify the rock by eye. Real geologists also use magnifiers, spectrometers and careful lab dating.',
    source: 'NASA Lunar Sample Compendium; NASA Apollo 15 mission',
  },
  breccia: {
    id: 'breccia',
    title: 'Rocks made by impacts',
    icon: '💥',
    body: [
      'A breccia is a rock made of broken pieces of older rocks, cemented together. On the Moon, most breccias were made when meteorites struck at enormous speed, smashing and melting the ground.',
      'Big impacts throw boulders far across the surface. By dating breccias, scientists learn when large impacts happened, which also tells us about the early history of Earth.',
    ],
    inGame: 'The boulder at site B is placed near a large crater so its story makes sense; it was not formed by that exact crater in any real record.',
    source: 'NASA Lunar Sample Compendium; NASA Astromaterials',
  },
  psr: {
    id: 'psr',
    title: 'Cold traps and ice',
    icon: '🧊',
    body: [
      'Near the poles, the Sun stays so low that the floors of some deep craters never see sunlight. These permanently shadowed regions are among the coldest places known in the Solar System, below −240 °C.',
      'In 2009 NASA’s LCROSS mission crashed a rocket stage into one such crater and found water in the plume: about 5% of the soil by mass. Ice may have arrived with comets and asteroids over billions of years.',
    ],
    inGame: 'You sample at the edge of the shadow. Going down into a real shadowed crater would need special heaters and lights.',
    source: 'NASA LCROSS mission (2009); LRO Diviner measurements',
  },
  isru: {
    id: 'isru',
    title: 'Using what the Moon gives',
    icon: '⛏️',
    body: [
      'In-situ resource utilisation (ISRU) means using local materials instead of bringing everything from Earth. On the Moon, regolith can become building material and radiation shielding.',
      'Almost half of regolith’s weight is oxygen, locked in minerals; heating it with the right chemicals can release oxygen to breathe. Ice from shadowed craters can give water, and splitting water gives oxygen and hydrogen, which are rocket fuel.',
    ],
    inGame: 'The outpost does not mine yet. Turning ISRU experiments into real factories is one of the big goals of Moon exploration.',
    source: 'NASA: In-Situ Resource Utilization; NASA MOXIE and lunar ISRU studies',
  },
  plume: {
    id: 'plume',
    title: 'Rocket blast and flying dust',
    icon: '🚀',
    body: [
      'In 1969, Apollo 12 landed less than 200 metres from Surveyor 3, a robot lander that had arrived two and a half years earlier. Parts the astronauts brought home were pitted and sandblasted by dust from their own lander’s engine.',
      'With no air to slow it down, dust kicked up by a rocket on the Moon can fly very fast and very far. NASA studies landing pads and safe distances so future landers do not damage bases nearby.',
    ],
    inGame: 'The damage here is a simple fixed amount. Real plume effects depend on the lander’s size, how far away it lands and the ground under it.',
    source: 'NASA Apollo 12 mission and Surveyor 3 analysis; NASA plume-surface interaction research',
  },
  leaks: {
    id: 'leaks',
    title: 'Hunting for leaks',
    icon: '🔊',
    body: [
      'In August 2018, the crew of the International Space Station found a hole about 2 millimetres across in a Soyuz spacecraft docked to the station. They sealed it with an epoxy patch.',
      'In 2020, cosmonauts tracked down a slow leak in the Zvezda module by letting tea leaves float in the air and watching where they drifted. Crews also use ultrasonic detectors that “hear” the very high hiss of escaping air.',
    ],
    inGame: 'Your detector works from outside and from a distance. Sound cannot travel through vacuum, so real detectors listen inside, where there is air, or are pressed against the wall.',
    source: 'NASA ISS status reports (2018, 2020)',
  },
  cooling: {
    id: 'cooling',
    title: 'Keeping cool in space',
    icon: '🌡️',
    body: [
      'A habitat full of people and electronics makes a lot of heat. On the ISS, pumps push coolant around loops that carry the heat to big radiators, which give it off into space as invisible infrared light.',
      'In 2010, a pump on one of the station’s two ammonia cooling loops failed. Astronauts made three spacewalks to replace it. The station stayed safe because the other loop kept working: engineers call this redundancy.',
    ],
    inGame: 'You change the motor in seconds. The real ISS pump module weighs about 350 kg and took three spacewalks to replace.',
    source: 'NASA ISS Active Thermal Control System; ISS pump module replacement (2010)',
  },
  filters: {
    id: 'filters',
    title: 'Cleaning water in space',
    icon: '💧',
    body: [
      'On the International Space Station, the Water Recovery System turns sweat, moisture from the crew’s breath and even urine back into clean drinking water. In 2023 NASA announced that it now recovers about 98% of the water.',
      'Its filters catch particles and chemicals and slowly fill up, so crews replace them regularly. Spare filters are some of the most important supplies on a long mission.',
    ],
    inGame: 'Water use and recovery are simplified. Real recyclers have several cleaning stages, and some water is also split to make oxygen.',
    source: 'NASA ISS Environmental Control and Life Support System (2023)',
  },
  relay: {
    id: 'relay',
    title: 'Talking to Earth',
    icon: '📡',
    body: [
      'Seen from the near side of the Moon, Earth stays in almost the same place in the sky. It only wobbles a little, so a dish can stay pointed at it for years.',
      'Near the south pole, Earth sits very low, and hills can block it. That is why NASA is planning relay satellites around the Moon to pass messages between the surface and Earth.',
    ],
    inGame: 'Messages here arrive instantly. Real radio signals take about 1.3 seconds to travel between Earth and the Moon.',
    source: 'NASA Lunar Communications Relay and Navigation Systems; NASA Space Communications and Navigation',
  },
  liion: {
    id: 'liion',
    title: 'Batteries wear out',
    icon: '🔋',
    body: [
      'Every time a battery charges and discharges, it wears a little. Between 2017 and 2021, astronauts on spacewalks replaced the space station’s old nickel-hydrogen batteries with newer lithium-ion ones.',
      'Each battery has sensors that watch its temperature and voltage. If a cell starts to fail, the system can switch that battery off before it becomes dangerous.',
    ],
    inGame: 'The game uses simple battery “modules”. Real battery packs have many cells, chargers and cooling systems.',
    source: 'NASA ISS battery replacement spacewalks (2017–2021)',
  },
  closedloop: {
    id: 'closedloop',
    title: 'Living off the land',
    icon: '🌙',
    body: [
      'The more an outpost can recycle and make for itself, the less has to be launched from Earth. Recycling air and water, growing food and making oxygen from regolith all help to “close the loop”.',
      'NASA’s Artemis program plans a long-term human presence at the Moon’s south pole, where long sunlight and ice make this easier. What crews learn there will help them on Mars, which is much farther from home.',
    ],
    inGame: 'Your 30 days are sped up and simplified. A real base would take many years to grow and would still need some supplies from Earth.',
    source: 'NASA Artemis program; NASA Moon to Mars architecture',
  },
  // ---------- secret discoveries (bonus cards) ----------
  glass: {
    id: 'glass',
    title: 'Orange glass beads',
    icon: '🔶',
    body: [
      'In 1972 Apollo 17 geologist Harrison Schmitt spotted orange soil at Shorty crater. Under a microscope it was made of tiny glass beads, smaller than grains of sand.',
      'They formed about 3.6 billion years ago, when fountains of lava sprayed molten drops high above the Moon. The drops cooled into glass before they landed.',
    ],
    inGame: 'The real orange soil is near the Moon’s equator, far from the south pole. We placed a patch here so you could see it, and made the beads big enough to spot.',
    source: 'NASA Apollo 17; Lunar Sample 74220',
  },
  freshcrater: {
    id: 'freshcrater',
    title: 'A brand-new crater',
    icon: '✨',
    body: [
      'Small rocks from space hit the Moon all the time. A fresh crater looks bright because it digs up clean rock that sunlight has not darkened yet.',
      'Over millions of years, the solar wind and tiny impacts slowly darken the surface. This is called space weathering. Bright rays around a crater mean it is young.',
    ],
    inGame: 'NASA’s Lunar Reconnaissance Orbiter has spotted hundreds of new craters that appeared after 2009. This one is about 3 m wide.',
    source: 'NASA LRO new-crater survey (Speyerer et al., 2016)',
  },
  golf: {
    id: 'golf',
    title: 'The Moon golf shot',
    icon: '⛳',
    body: [
      'In 1971 Apollo 14 commander Alan Shepard hit two golf balls on the Moon. His club was a golf club head fixed to a tool handle, and his stiff suit let him swing with only one hand.',
      'With one sixth of Earth’s gravity and no air to slow it down, a ball flies higher and farther, and it can never curve: there is no air to make it swerve. Shepard’s second ball went about 40 yards.',
    ],
    inGame: 'This is a tribute ball. Shepard’s real golf balls are still at Fra Mauro, near the Moon’s equator. Your swing goes a lot farther than his.',
    source: 'NASA Apollo 14 Lunar Surface Journal',
  },
  meteorite: {
    id: 'meteorite',
    title: 'A rock from somewhere else',
    icon: '☄️',
    body: [
      'Most rocks here are Moon rocks, but some fell from space. Apollo 12 soil held a piece of a meteorite, and scientists have found meteorite bits in many Moon samples.',
      'With no air, nothing burns up on the way down: space rocks hit at full speed. Most melt or vaporise, but slow ones can leave pieces. Iron meteorites never rust here, because there is no air or water.',
    ],
    inGame: 'We made this one a big iron chunk so you can spot it. Real meteorite pieces on the Moon are usually tiny.',
    source: 'NASA Lunar Sample Compendium; Apollo 12 “Bench Crater” meteorite',
  },
  thermalcrack: {
    id: 'thermalcrack',
    title: 'The rock the Sun broke',
    icon: '🌡️',
    body: [
      'A day on the Moon lasts about two weeks, and so does the night. Near the equator the ground swings from about 120 °C in the day to −130 °C at night.',
      'Rocks grow a tiny bit in the heat and shrink in the cold. Over millions of swings, small cracks spread until a boulder splits apart. Scientists call this thermal fatigue.',
    ],
    inGame: 'At the south pole the swings are smaller, because the Sun stays low. We split this boulder cleanly so the cracks are easy to see.',
    source: 'Molaro et al. 2017 (thermal fatigue); NASA LRO Diviner',
  },
  eternallight: {
    id: 'eternallight',
    title: 'Peaks of almost eternal light',
    icon: '☀️',
    body: [
      'At the poles the Sun skims along the horizon. Some high ridges near the south pole stay in sunlight for most of the year, while crater floors nearby stay dark.',
      'These peaks are prime spots for solar panels and future bases: almost non-stop power, with ice in the dark craters just next door.',
    ],
    inGame: 'No real peak is lit 100% of the time; the best get sunlight about 90% of the year. In the game this ridge just stays in the Sun.',
    source: 'NASA LRO LOLA illumination maps',
  },
  earthshine: {
    id: 'earthshine',
    title: 'Earthshine',
    icon: '🌏',
    body: [
      'Earth reflects sunlight onto the Moon. When the Sun is down, the ground facing Earth glows a faint blue-grey. Leonardo da Vinci worked this out about 500 years ago.',
      'A full Earth seen from the Moon is about 40 times brighter than a full Moon seen from Earth. On the long lunar night it is bright enough to walk by.',
    ],
    inGame: 'Earthshine is hard to see while the Sun is up. You can see it best during the dark hours in Mission 3.',
    source: 'NASA Earthshine; Leonardo da Vinci, Codex Leicester',
  },
  hammerfeather: {
    id: 'hammerfeather',
    title: 'Hammer and feather',
    icon: '🔨',
    body: [
      'In 1971 Apollo 15 commander David Scott dropped a hammer and a falcon feather at the same moment, on live TV. They hit the ground together.',
      'Galileo predicted it: without air, everything falls at the same rate, whatever it weighs. On Earth the air slows the feather down, so it drifts.',
    ],
    inGame: 'The real hammer and feather were left at Hadley Rille. The feather was a nod to the mission’s lunar module, named Falcon. The cutscene shows the fall in slow motion.',
    source: 'NASA Apollo 15 Lunar Surface Journal',
  },
  scarp: {
    id: 'scarp',
    title: 'The shrinking Moon',
    icon: '📉',
    body: [
      'As the inside of the Moon cools, it shrinks a little, like a grape drying into a raisin. The crust cracks and one side is pushed up over the other, making low cliffs called lobate scarps.',
      'NASA’s LRO has found thousands of them. Some look young, and moonquake records suggest the Moon may still be shrinking today.',
    ],
    inGame: 'Real scarps can be kilometres long and tens of metres high. This one is short so it fits on our map.',
    source: 'NASA LRO; Watters et al. 2019 (Nature Geoscience)',
  },
  moonquake: {
    id: 'moonquake',
    title: 'Moonquakes',
    icon: '📈',
    body: [
      'Apollo astronauts left seismometers that recorded moonquakes from 1969 to 1977. Some came from deep inside, some from meteorite hits, and some were strong quakes near the surface.',
      'The Moon is dry and stiff, so it rings like a bell. When an old spacecraft stage was crashed into it on purpose, the shaking went on for nearly an hour. Bases will need to be built for that.',
    ],
    inGame: 'This old station is made up. The real Apollo seismometers were switched off in 1977.',
    source: 'NASA Apollo Passive Seismic Experiment',
  },
  familyphoto: {
    id: 'familyphoto',
    title: 'A photo left on the Moon',
    icon: '📷',
    body: [
      'In 1972 Apollo 16 astronaut Charlie Duke left a family photo on the Moon. His family wrote on the back that they were the family of an astronaut from planet Earth.',
      'With no wind or rain, things on the Moon change very slowly. But sunlight is fierce up here, and Duke thinks his photo has faded to white by now.',
    ],
    inGame: 'This photo is pretend: the junior astronaut’s own family. Duke’s real photo lies in the Descartes Highlands.',
    source: 'NASA Apollo 16; Charlie Duke interviews',
  },
  vesicles: {
    id: 'vesicles',
    title: 'Rock full of bubbles',
    icon: '🌋',
    body: [
      'Some Moon rocks are full of small round holes called vesicles. They are gas bubbles that got trapped when lava cooled and hardened into basalt.',
      'The dark patches you see on the Moon from Earth, the maria, are huge plains of basalt lava from 3 to 4 billion years ago. Apollo 15 brought home a famous bubbly basalt.',
    ],
    inGame: 'The south pole is mostly pale highland rock, so basalt like this is rare here. Think of it as thrown here by a faraway impact.',
    source: 'NASA Lunar Sample 15016',
  },
  solarwind: {
    id: 'solarwind',
    title: 'Moon soil remembers the Sun',
    icon: '🌞',
    body: [
      'The Sun blows out a stream of particles called the solar wind. On Earth our air and magnetic field block it, but on the Moon it hits the ground directly.',
      'For billions of years the soil has caught hydrogen and helium from the Sun. Each layer of soil is like a page in a diary of how the Sun has changed.',
    ],
    inGame: 'This is a drive tube, the kind Apollo crews hammered into the ground. One Apollo 17 tube stayed sealed for 50 years and was opened in 2022.',
    source: 'NASA ANGSA programme; Apollo drive tubes',
  },
  plush: {
    id: 'plush',
    title: 'The zero-g indicator',
    icon: '🧸',
    body: [
      'Many crews bring a small soft toy. When it starts to float on the way up, everyone knows they have reached weightlessness. It is called a zero-g indicator.',
      'On Artemis I in 2022, a Snoopy plush floated inside the Orion capsule. On the Moon a toy sits down again, because the Moon’s gravity still pulls on it.',
    ],
    inGame: 'This little bear in a space suit belongs to one of your crewmates. Someone must have left it here on a sensor walk.',
    source: 'NASA Artemis I',
  },
  skylight: {
    id: 'skylight',
    title: 'A hole into a lava tube',
    icon: '🕳️',
    body: [
      'NASA’s LRO has found more than 200 pits on the Moon. Some may lead into lava tubes: long tunnels left behind when rivers of lava drained away underground.',
      'A lava tube could shield a base from radiation and small meteorites. In the shade of one pit that LRO studied, the temperature stays near 17 °C all the time.',
    ],
    inGame: 'Real pits are about 50 to 100 m wide. You cannot go down into this one: there is no safe way in.',
    source: 'NASA LRO; Horvath et al. 2022 (Geophysical Research Letters)',
  },
  radmeasure: {
    id: 'radmeasure',
    title: 'Who measured Moon radiation?',
    icon: '☢️',
    body: [
      'In 2019 China’s Chang’e 4 lander carried a German-built detector to the far side of the Moon. It measured about 1.37 millisieverts of radiation per day on the surface.',
      'That is about 200 times more than on Earth’s surface, and it is the number this game uses. It helps planners work out how much shielding a base needs.',
    ],
    inGame: 'This detector box is made up. The real one, called LND, is on the far side in Von Kármán crater.',
    source: 'Zhang et al. 2020 (Science Advances)',
  },
  icefrost: {
    id: 'icefrost',
    title: 'Ice you can see',
    icon: '💎',
    body: [
      'In 2018 scientists confirmed water ice right on the surface, inside the coldest shadowed craters near both poles. NASA’s M3 instrument on India’s Chandrayaan-1 spotted it.',
      'The ice lies in patches mixed with dust. One day it could give a base drinking water, oxygen to breathe, and hydrogen for rocket fuel.',
    ],
    inGame: 'Real surface frost is too thin to sparkle like this, and those craters sit in total darkness at about −240 °C. We made it glitter in your lamp so you can find it.',
    source: 'Li et al. 2018 (PNAS); NASA Moon Mineralogy Mapper',
  },
  surveyor: {
    id: 'surveyor',
    title: 'The robot that waited',
    icon: '🤖',
    body: [
      'In 1967 the robot lander Surveyor 3 touched down on the Moon. Two and a half years later, the Apollo 12 astronauts landed within walking distance and went to visit it.',
      'They took its TV camera and other parts home. Scientists studied how 31 months on the Moon had changed its metal, glass and paint.',
    ],
    inGame: 'This old lander is a made-up robot in the same style. Surveyor 3 is still in the Ocean of Storms.',
    source: 'NASA Apollo 12; Surveyor 3',
  },
  impactflash: {
    id: 'impactflash',
    title: 'Impact flash!',
    icon: '💥',
    body: [
      'Sometimes a space rock hits the Moon so fast that it makes a flash of light that telescopes on Earth can see. NASA has recorded hundreds of these flashes.',
      'In March 2013 a boulder about 40 cm across hit at around 90,000 km/h. It flashed as bright as a star and blasted a crater 18 m wide.',
    ],
    inGame: 'Real impacts this close to a base would be very rare. You would not hear it either: with no air, you only feel a faint rumble through the ground.',
    source: 'NASA Meteoroid Environment Office; LRO',
  },
  dustglow: {
    id: 'dustglow',
    title: 'The horizon glow mystery',
    icon: '🌅',
    body: [
      'After sunset, robot Surveyor landers photographed a faint glow along the Moon’s horizon. Apollo astronauts in orbit sketched strange light streamers too.',
      'One idea: sunlight gives dust grains an electric charge until some lift off the ground. NASA’s LADEE spacecraft went to look in 2013 and found much less floating dust than expected. The mystery is still open.',
    ],
    inGame: 'This detector is made up. The game does not show the glow, because nobody is sure how it really looks.',
    source: 'NASA Surveyor 7; LADEE mission',
  },
  retroreflector: {
    id: 'retroreflector',
    title: 'The mirror on the Moon',
    icon: '🎯',
    body: [
      'Apollo 11, 14 and 15 left mirrors called retroreflectors. Observatories on Earth still fire lasers at them and time how long the light takes to bounce back.',
      'The timing shows that the Moon is moving away from Earth by about 3.8 cm every year, about as fast as your fingernails grow.',
    ],
    inGame: 'Real laser beams are invisible in space and spread to a few kilometres wide by the time they reach the Moon. We drew a green beam so you can see it.',
    source: 'NASA Lunar Laser Ranging',
  },
  airlock: {
    id: 'airlock',
    title: 'How an airlock works',
    icon: '🚪',
    body: [
      'An airlock is a small room with two doors: one into the habitat and one to the outside. Only one door opens at a time. To go out, astronauts close the inner door and pumps take the air out until the pressure is almost zero; only then can the outer door open. Coming back, the room is filled with air again before the inner door opens.',
      'On the ISS, the Quest airlock saves air by pumping most of it back into the station instead of letting it escape into space. On the Moon an airlock also helps keep out the sharp, clingy lunar dust: after their moonwalks the Apollo astronauts found it on everything.',
    ],
    inGame: 'Our airlock fills and empties in a few seconds. A real one takes several minutes, and spacewalkers often breathe pure oxygen for a while before going out.',
    source: 'NASA: ISS Quest Joint Airlock; NASA Apollo lunar dust reports',
  },
  exercise: {
    id: 'exercise',
    title: 'Exercise in low gravity',
    icon: '🚴',
    body: [
      'In low gravity, muscles and bones do less work, so they get weaker. In weightlessness, astronauts who did not exercise could lose about 1 to 1.5 percent of the bone in their hips and legs every month.',
      'ISS astronauts exercise for about 2 hours every day, on an exercise bike, a treadmill (with straps that pull them down) and a weightlifting machine. The Moon’s gravity, one sixth of Earth’s, helps a little, but scientists expect Moon crews will still need to exercise every day.',
    ],
    inGame: 'A few seconds on the bike gives you a little health. Real crews exercise for hours, every day.',
    source: 'NASA Human Research Program; NASA ISS exercise equipment (CEVIS, T2, ARED)',
  },
  plss: {
    id: 'plss',
    title: 'A spacesuit is a tiny spaceship',
    icon: '🎒',
    body: [
      'The backpack on a spacesuit is its Portable Life Support System. It gives you oxygen, removes the carbon dioxide you breathe out, and pumps cool water through thin tubes in a special undergarment so you do not overheat in the sunshine.',
      'Between moonwalks the suit is plugged into the habitat to charge its battery, refill its oxygen and water, and clean or swap its carbon dioxide filters. Apollo’s backpack let astronauts work outside for up to about 7 hours.',
    ],
    inGame: 'Our suit station refills everything in a few seconds. Real servicing takes hours.',
    source: 'NASA: Apollo Portable Life Support System; NASA EMU and xEMU life support',
  },
  eclipse: {
    id: 'eclipse',
    title: 'When Earth hides the Sun',
    icon: '🔴',
    body: [
      'When people on Earth see a lunar eclipse, someone on the Moon would see Earth slide in front of the Sun.',
      'Earth becomes a dark disc with a glowing red ring: the light of every sunrise and sunset on Earth at the same moment. That red light is why the Moon turns red in an eclipse. Surveyor 3 photographed it in 1967.',
    ],
    inGame: 'The cutscene jumps ahead to the next eclipse. A real one lasts a few hours.',
    source: 'NASA Surveyor 3 (1967)',
  },
};

/** The card in the current UI language (Burmese falls back to English per field). */
export function cardFor(id: string, lang: 'en' | 'my'): Card | undefined {
  const c = CARDS[id];
  if (!c || lang === 'en') return c;
  const m = CARDS_MY[id];
  return m ? { ...c, title: m.title, body: m.body, inGame: m.inGame } : c;
}
