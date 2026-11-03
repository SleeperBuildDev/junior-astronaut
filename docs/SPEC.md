# Junior Astronaut: Lunar Survival Mission — Original Game Spec

> This is the owner's original design specification, copied verbatim. Section 13 was cut off
> when it was pasted (it ends after its first sentence). Ask the owner (Hein Htet) for the rest of
> section 13 and any later sections before designing the website structure.
> Note: this is a **test project**, not a real NASA Space Apps entry, so the hackathon's
> "don't start before the event" rule does not apply.

---

JUNIOR ASTRONAUT: LUNAR SURVIVAL MISSION

Complete Game Design and Development Specification

## 1. Project Overview and Vision

Create a high-quality, immersive, browser-based 3D first-person lunar survival and space engineering simulation game called Junior Astronaut: Lunar Survival Mission. The game is designed for the 2026 NASA Space Apps Challenge and aims to introduce younger students and beginners to the real engineering challenges of establishing and maintaining a sustainable human settlement on the Moon.

The game must provide an interactive experience in which players take the role of an astronaut assigned to a lunar exploration and settlement mission. Instead of simply reading educational information about space, players should learn through exploration, experimentation, decision-making, problem-solving and experiencing the consequences of their engineering decisions.

The main concept is to combine first-person exploration, survival simulation, resource management, lunar base construction, scientific research and mission-based challenges into one connected gameplay experience. Players must explore the lunar environment, establish a functioning outpost, manage essential resources, maintain equipment, protect their astronaut crew and complete scientific objectives while working with limited supplies.

The ultimate goal is to establish a sustainable lunar research outpost and successfully maintain it throughout a 30-day mission. Every gameplay system should contribute to this central objective.

This project must be developed and hosted as a website that runs directly inside a modern desktop web browser. It must not be designed as a conventional mobile application or require users to download and install a separate game client.

## 2. Core Gameplay Perspective and Experience

The entire main gameplay experience must use a first-person perspective (FPP). Players should experience the Moon through the eyes of an astronaut rather than controlling a character from a third-person camera or managing a static dashboard.

The player should be able to walk around the lunar surface, inspect objects, approach machines, enter buildings, operate equipment, collect scientific samples, repair damaged systems and interact with different facilities.

Use WASD for movement, mouse movement for looking around, Space for jumping, Shift for sprinting, E for interaction and Escape to release mouse control. Include clear control instructions and an introductory tutorial so that new players understand the controls immediately.

Movement should feel appropriate for a lunar environment. The astronaut should experience reduced gravity, longer and more noticeable jumps, slower falling, controlled movement and a slight sense of weightlessness. However, movement must remain responsive and enjoyable. Do not make the character feel excessively slow or difficult to control.

The camera should remain at a believable astronaut eye level. Implement collision detection so the player cannot walk through buildings, equipment, rocks or other physical objects. Add smooth camera movement, subtle head movement and appropriate landing feedback when jumping.

## 3. Visual Direction and Environmental Quality

The visual quality of the game is one of its highest priorities. The environment must feel like a believable lunar landscape rather than a collection of primitive geometric shapes.

Use a realistic, cinematic lunar visual style inspired by high-quality space exploration games, NASA lunar mission concepts and realistic science-fiction environments. The visual direction should balance scientific credibility with an attractive and accessible gaming experience.

The lunar surface should include uneven terrain, visible craters, realistic regolith textures, scattered rocks, small geological formations, surface depressions, distant hills and varied elevation. Avoid using one enormous flat grey plane as the entire environment. Create a landscape that feels natural, spacious and explorable.

The environment should have a dark space sky with visible stars and a realistic view of Earth in the distance where appropriate. The Moon's lighting should be dramatic and directional, with sunlight creating long shadows across the surface. The environment should communicate the lack of atmosphere and the harsh conditions of the lunar surface.

Use realistic PBR materials, high-quality textures, ambient occlusion, shadows, reflections where appropriate, environmental lighting and post-processing effects. Add atmospheric visual details without incorrectly suggesting that the Moon has an Earth-like atmosphere.

The lunar base must look like an actual scientific research outpost. It should contain interconnected pressurized habitat modules, airlocks, storage units, solar arrays, communication antennas, power distribution equipment, oxygen tanks, water recycling facilities and scientific laboratories.

Solar panels should have visible photovoltaic cells, structural support frames and realistic positioning. Habitats should contain detailed doors, windows, warning lights, external pipes, connecting corridors and equipment. Each building should have a clear purpose and visually communicate its function.

Include additional environmental objects such as lunar rovers, equipment crates, scientific instruments, communication towers, landing markers, astronaut footprints, sample collection areas and emergency equipment.

Do not rely on basic coloured cubes and cylinders for important environmental objects. Use detailed 3D models, custom-built geometry, high-quality materials and textures. Use optimized GLTF or GLB models where appropriate.

## 4. Storyline and Mission Background

The player is a junior astronaut selected to participate in an international lunar research and settlement program. A four-person astronaut crew has arrived at a designated lunar landing site with the objective of establishing a sustainable research outpost.

The player is assigned responsibility for helping establish the base, operating equipment, conducting research and maintaining essential systems.

The mission begins shortly after landing. The lunar outpost is not yet fully operational. Some equipment is available, but the player must inspect, activate and construct additional facilities before the settlement can support the crew independently.

During the mission, the player receives instructions from Mission Control through an in-game communication interface. Mission Control provides objectives, explanations, warnings, scientific information and emergency instructions.

As the mission progresses, the player encounters engineering challenges involving energy production, water availability, oxygen systems, food production, temperature regulation, radiation protection and equipment reliability.

The storyline should develop gradually through mission briefings, environmental storytelling, radio communications, objectives, discoveries and mission reports.

## 5. Mission Structure and Progression

Organize the game into connected missions that gradually introduce more advanced concepts. Each mission should have a clear objective, instructions, interactive activities, success conditions and educational explanations.

Mission 1: First Steps on the Moon. Begin with an introductory landing sequence. Allow the player to explore the landing site, understand lunar movement, inspect the surroundings and locate the main habitat. Introduce the astronaut controls, suit HUD, oxygen monitoring and basic interactions. The player must locate the lunar base and complete an initial environmental inspection.

Mission 2: Life Support Activation. Introduce the importance of oxygen and water management. The player must locate the life-support facility, inspect its systems and activate the oxygen supply and water recycling equipment. Teach players why astronauts cannot survive without reliable life-support systems and why recycling is essential when resupply is limited.

Mission 3: Power Up the Outpost. Introduce energy generation and electrical distribution. The player must inspect the power facility, deploy or activate solar panels and connect the system to the lunar outpost. Explain the relationship between sunlight, energy generation, energy storage and power consumption. Include the challenge of managing energy during periods when sunlight is unavailable.

Mission 4: Build a Lunar Habitat. Allow the player to construct or activate additional habitat modules. Explain why astronauts need pressurized environments, thermal regulation, radiation protection, safe sleeping areas and reliable life-support infrastructure. The player must ensure that the habitat can support the crew.

Mission 5: Establish Food Production. Introduce controlled-environment agriculture. The player must construct and activate a greenhouse, manage its energy and water requirements, and monitor food production. Explain the difficulties of growing food in a controlled lunar environment and the importance of sustainable food systems.

Mission 6: Radiation Protection. Introduce the dangers of radiation exposure beyond Earth's protective magnetic field and atmosphere. The player must inspect radiation monitoring equipment, identify vulnerable areas and install appropriate shielding. Explain how shielding materials, regolith and protected shelters can reduce radiation exposure.

Mission 7: Scientific Exploration. Allow players to explore a wider section of the lunar surface using scientific equipment and a lunar rover. The player must collect lunar soil samples, inspect geological formations, record scientific observations and return samples to the research laboratory. Explain the scientific value of studying lunar geology and local resources.

Mission 8: Emergency Response. Introduce unexpected mission events. The player may experience a damaged solar array, equipment failure, an oxygen leak, a water recycling malfunction, a temperature-control problem or a radiation warning. Players must identify the problem, understand its consequences and choose an appropriate response.

Mission 9: Sustainable Lunar Settlement. Combine all previous systems into one long-term survival challenge. Players must maintain oxygen, water, food, energy, temperature and radiation protection while keeping the base operational. The objective is to establish a sustainable outpost and successfully complete the required 30-day mission.

Mission progression should be based on completed objectives and system readiness rather than simply allowing players to click through missions.

## 6. First-Person Interaction System

Create a complete interaction system that allows players to engage with objects in the environment.

When the player looks at or approaches an interactive object, display a contextual prompt explaining what action is available. Use the E key to activate the interaction.

Examples include activating oxygen stations, operating water recycling equipment, inspecting solar panels, repairing machines, opening airlocks, collecting samples, accessing computer terminals, controlling greenhouse systems and operating research equipment.

Important interactions should open attractive in-game interfaces rather than displaying plain browser alerts. Use interactive panels, machine displays, status indicators, progress bars, buttons and short explanations.

When a player interacts with an object, the game should respond visually and mechanically. For example, activating a solar array should change its status indicator, update available energy and display a confirmation message.

Objects should have clear interaction states such as inactive, active, damaged, under maintenance and unavailable.

## 7. Survival and Resource Management Systems

Create a connected survival simulation in which every resource has a purpose and affects the success of the mission.

The main resources are oxygen, water, food, energy, temperature regulation, radiation protection and equipment condition.

Oxygen should be consumed as the astronaut performs activities and remains outside the habitat. Players should be able to refill their suit at designated oxygen stations or through functioning life-support facilities. Critical oxygen depletion should result in an emergency and eventually mission failure.

Water should be used for drinking, hygiene, food production and other essential operations. Include water recycling systems that recover and reuse available water. Explain that water is limited and that recycling is essential for long-duration missions.

Food should be consumed by the astronaut crew. Initially, the outpost may depend on stored food supplies. Once the greenhouse becomes operational, it should contribute to food production. Food production must require appropriate water, energy and operating conditions.

Energy should power habitat systems, life-support equipment, scientific instruments, greenhouse systems and communication equipment. Solar panels should generate electricity, while energy storage systems should provide power when generation is insufficient. Players should make decisions about energy priorities and avoid wasting limited power.

Temperature regulation should represent the challenge of maintaining safe internal conditions in a lunar habitat. Players should monitor heating and cooling systems and repair failures when necessary.

Radiation protection should influence astronaut safety during solar particle events and other hazardous conditions. Proper shielding and protected shelter areas should reduce exposure.

Equipment condition should represent the reliability of important facilities. Machines may become damaged or require maintenance, creating additional engineering challenges.

Every resource must have a visible status indicator, current quantity, consumption or production rate and warning threshold. Avoid making resource values arbitrary. Explain the simplified assumptions used by the game.

## 8. Lunar Base Construction System

Create a construction system that allows players to develop the outpost physically.

Players should be able to access a construction terminal or designated building area, select a facility, review its requirements and place or activate it at an appropriate location.

Include the following construction options:

- Lunar habitat modules for astronaut accommodation.
- Solar arrays for electricity generation.
- Battery storage units for energy storage.
- Greenhouses for food production.
- Oxygen generation and storage facilities.
- Water recycling systems.
- Radiation shelters and shielding structures.
- Scientific laboratories.
- Communication antennas.
- Equipment maintenance facilities.

Every structure should have a specific purpose, construction cost, resource requirements, operational requirements and effect on the outpost.

Construction should not be purely decorative. Every completed building must change the game systems in a meaningful way.

For example, solar arrays increase available electricity, battery storage improves energy availability, greenhouses contribute to food production and water recycling facilities reduce dependence on stored water.

Players should be required to think about construction priorities. Building everything immediately should not be possible. Limited resources should create meaningful engineering trade-offs.

## 9. Astronaut Crew Management

The lunar mission should contain four astronaut crew members, including the player.

The crew should have different responsibilities: mission commander, engineer, scientist and medical officer.

Each crew member should have a defined role and contribute to the success of the outpost. The engineer can assist with equipment maintenance, the scientist can support research activities, the medical officer can monitor crew health and the commander can coordinate mission objectives.

Display crew information through the mission interface. Include crew condition, health status, safety and important operational alerts.

Crew safety must be affected by the condition of the habitat, availability of life-support resources, temperature regulation and radiation exposure.

The player should understand that maintaining the outpost is not only about personal survival. It is about keeping an entire crew safe.

## 10. Dynamic Events and Emergencies

Introduce random and mission-based events to make every playthrough more interesting.

Possible events include solar panel damage caused by environmental conditions, unexpected equipment malfunction, oxygen leakage, water recycling failure, greenhouse temperature problems, communication interruptions, battery degradation and solar radiation warnings.

Each event should include a clear description, severity level, affected systems and available response options.

For example, when a solar array malfunctions, the player may inspect it, travel to the equipment location, diagnose the issue and perform a repair. During the repair, the outpost may need to operate on stored energy.

A radiation warning should encourage players to move the crew into a protected area. An oxygen leak should require immediate attention to prevent dangerous oxygen loss.

Events should create consequences that affect the wider mission. They must not simply appear as random messages without influencing gameplay.

The player should be able to learn from each emergency by receiving an explanation of what happened, why it happened and how engineers can prevent similar problems.

## 11. Scientific Research and Educational Content

The game must teach real space science and engineering concepts through gameplay.

Every major system should have an educational explanation that is understandable to younger learners.

Include topics such as lunar gravity, the Moon's lack of a breathable atmosphere, radiation exposure, solar power, energy storage, life-support systems, water recycling, controlled-environment agriculture, thermal management, lunar geology and in-situ resource utilization.

Whenever players interact with scientific equipment or complete an important objective, provide a short educational explanation.

For example, after activating the water recycling facility, explain why recovering water is important for long-duration space missions.

After completing radiation shielding, explain why astronauts need protection from energetic particles and why lunar regolith may be useful as shielding material.

Include a scientific information database or mission knowledge center where players can review concepts they have discovered.

Scientific content must be accurate, age-appropriate and based on reliable NASA or other authoritative scientific resources. Clearly distinguish simplified game mechanics from actual engineering specifications.

## 12. User Interface and Suit HUD

The main gameplay screen should use a professional astronaut suit interface.

The HUD must remain visible without obstructing the player's view of the environment.

Display oxygen level, suit battery, health, temperature, radiation exposure, current mission day, mission objective and important warnings.

Use clear icons, readable labels, percentage indicators and colour-coded warnings.

Critical alerts should be visually noticeable but not unnecessarily distracting.

Include a small crosshair in the centre of the screen and contextual interaction prompts when the player approaches usable objects.

Provide a mission objective panel that can display the current task, completed objectives and remaining requirements.

Include a mission communication interface where Mission Control can send messages, instructions, warnings and updates.

Add a pause menu with resume, settings, control instructions and restart mission options.

The HUD should feel like a real astronaut interface rather than a conventional website dashboard.

## 13. Main Menu and Website Structure

Because the project will be hosted on a website, the entire experience must be accessible through a browser.

*(The pasted spec ends here — ask the owner for the rest.)*
