
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let scene, renderer, camera, camcontrols;
let mapa, mapsx, mapsy;

var GUI = lil.GUI;

// Center and zoom level of the map
const centerLat = 27.9556;
const centerLon = -15.6102;
const zoomLevel = 11;

// Dimensions of the map tiles
const tileSize = 256; // Tamaño de un tile en píxeles
const numTiles = 6; // Número de tiles a cargar en cada dirección (total 3x3)

// Variables para los límites del mapa
let minlon, maxlon, minlat, maxlat;

// Datos de vehículos
const vehicleData = [];
const vehicleTrajectories = {};
const vehicleMeshes = {};

// Uniforms for shaders
const currentTimeUniform = { value: 0 };
const fadeDurationUniform = { value: 14000.0 }; // Default fade duration

const fechaInicio = new Date('2024-10-29T09:00:00'); // Fecha inicial del dataset
let fechaActual = new Date(fechaInicio);
let totalSegundos = 0;
let fecha2show;

// Clock to track time
const clock = new THREE.Clock();

// GUI parameters
const guiParams = {
	fadeDuration: 7000.0,
	vehicleId: null,
	isAnimating: true,
	vehicleIdController: null,
	mostrarRutasCompletadas: true,
	guiDarkness: 0.3,
	blendFactor: 1.0, // 0 = día, 1 = noche
};

init();
animate();

function init() {
	// Muestra fecha como título
	fecha2show = document.createElement('div');
	fecha2show.style.position = 'absolute';
	fecha2show.style.top = '30px';
	fecha2show.style.width = '100%';
	fecha2show.style.textAlign = 'center';
	fecha2show.style.color = '#fff';
	fecha2show.style.fontWeight = 'bold';
	fecha2show.style.backgroundColor = 'transparent';
	fecha2show.style.zIndex = '1';
	fecha2show.style.fontFamily = 'Monospace';
	fecha2show.innerHTML = '';
	document.body.appendChild(fecha2show);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	// Posición de la cámara
	camera.position.z = 2.2;

	renderer = new THREE.WebGLRenderer();
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);

	camcontrols = new OrbitControls(camera, renderer.domElement);

	// Calculate the initial map tiles to load
	const centerTile = latLonToTile(centerLat, centerLon, zoomLevel);
	const startX = centerTile.x - Math.floor(numTiles / 2);
	const startY = centerTile.y - Math.floor(numTiles / 2);

	// Create the map tiles
	mapsx = numTiles;
	mapsy = numTiles;
	mapa = new THREE.Group();
	scene.add(mapa);

	loadMapTiles(startX, startY, zoomLevel, numTiles).then(() => {
		// After loading the tiles, load the vehicle data
		fetch('vehicle-coordinates.csv')
			.then((response) => {
				if (!response.ok) {
					throw new Error('Error: ' + response.statusText);
				}
				return response.text();
			})
			.then((content) => {
				procesarCSVVehiculos(content, gui);
			})
			.catch((error) => {
				console.error('Error al cargar el archivo:', error);
			});
	});

	// Create GUI
	const gui = new GUI();
	gui
		.add(guiParams, 'fadeDuration', 1000, 14000)
		.name('Fade Duration (ms)')
		.onChange(function (value) {
			fadeDurationUniform.value = value;
		});
	gui
		.add(guiParams, 'guiDarkness', 0.0, 1.0)
		.name('Oscuridad del mapa')
		.onChange(function (value) {
			for (let i = 0; i < mapa.children.length; i++) {
				mapa.children[i].material.uniforms.darkness.value = value;
			}
		});

	gui.add(guiParams, 'isAnimating').name('Animación');

	gui
		.add(guiParams, 'mostrarRutasCompletadas')
		.name('Mostrar rutas completadas')
		.onChange(function (value) {
			updateShaders();
		});

	// Añadimos un control en la GUI para el blendFactor
	gui
		.add(guiParams, 'blendFactor', 0, 1)
		.name('Transición Día/Noche')
		.onChange((value) => {
			// Actualizamos el uniform en los materiales de los tiles
			mapa.children.forEach((mesh) => {
				mesh.material.uniforms.blendFactor.value = value;
			});
		});

	const vehicleIdOptions = { Todos: null };

	guiParams.vehicleIdController = gui
		.add(guiParams, 'vehicleId', vehicleIdOptions)
		.name('Vehículo')
		.onChange(function (value) {
			updateVehicleVisibility();
		});
	// Add Restart button
	gui.add({ restart: restartAnimation }, 'restart').name('Restart');
}

// Function to reset the animation
function restartAnimation() {
	totalSegundos = 0;
	fechaActual = new Date(fechaInicio);
	currentTimeUniform.value = fechaActual.getTime() / 1000; // Reset uniform to initial time
	clock.elapsedTime = 0; // Reset clock

	document.querySelector('#elapsed-time').innerHTML = '09:00:00';
}

function loadMapTiles(startX, startY, zoom, numTiles) {
	const tilePromises = [];

	for (let x = startX; x < startX + numTiles; x++) {
		for (let y = startY; y < startY + numTiles; y++) {
			// URLs de las texturas de día y noche (reemplaza 'YOUR_API_KEY' con tu clave)
			// const urlDay = `https://tile.thunderforest.com/transport/${zoom}/${x}/${y}.png?apikey=<YOUR_API_KEY>`;
			// const urlNight = `https://tile.thunderforest.com/transport-dark/${zoom}/${x}/${y}.png?apikey=<YOUR_API_KEY>`;

			// Replace with Thunderforest if you have an API key
			const urlDay = `https://a.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
			const urlNight = `https://b.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

			// Cargamos ambas texturas
			const loader = new THREE.TextureLoader();
			const tilePromise = new Promise((resolve) => {
				loader.load(urlDay, (textureDay) => {
					loader.load(urlNight, (textureNight) => {
						// Creamos el ShaderMaterial combinando ambas texturas
						const material = new THREE.ShaderMaterial({
							uniforms: {
								textureDay: { value: textureDay },
								textureNight: { value: textureNight },
								blendFactor: { value: guiParams.blendFactor }, // Add blendFactor uniform
								darkness: { value: guiParams.guiDarkness }, // Add darkness uniform
							},
							vertexShader: `
					   varying vec2 vUv;
					   void main() {
						 vUv = uv;
						 gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					   }
					 `,
							fragmentShader: `
					   uniform sampler2D textureDay;
					   uniform sampler2D textureNight;
					   uniform float blendFactor;
					   uniform float darkness;
					   varying vec2 vUv;
					   void main() {
						 vec4 colorDay = texture2D(textureDay, vUv);
						 vec4 colorNight = texture2D(textureNight, vUv);
						 vec4 finalColor = mix(colorDay, colorNight, blendFactor);
						 finalColor.rgb *= 1.0 - darkness; // Apply darkness
						 gl_FragColor = finalColor;
					   }
					 `,
						});

						const geometry = new THREE.PlaneGeometry(1, 1);
						const mesh = new THREE.Mesh(geometry, material);
						mesh.position.x = x - startX - numTiles / 2 + 0.5;
						mesh.position.y = -(y - startY - numTiles / 2 + 0.5);
						mapa.add(mesh);
						resolve();
					});
				});
			});
			tilePromises.push(tilePromise);
		}
	}

	// Al final de la función, devuelve la Promise
	return Promise.all(tilePromises).then(() => {
		console.log('Tiles loaded');
		const minTileX = startX;
		const maxTileX = startX + numTiles - 1;
		const minTileY = startY;
		const maxTileY = startY + numTiles - 1;

		const minLatLon = tileToLatLon(minTileX, maxTileY + 1, zoom);
		const maxLatLon = tileToLatLon(maxTileX + 1, minTileY, zoom);

		minlat = minLatLon.lat;
		minlon = minLatLon.lon;
		maxlat = maxLatLon.lat;
		maxlon = maxLatLon.lon;
	});
}

function latLonToTile(lat, lon, zoom) {
	const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
	const y = Math.floor(
		((1 -
			Math.log(
				Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
			) /
				Math.PI) /
			2) *
			Math.pow(2, zoom)
	);
	return { x, y };
}

function tileToLatLon(x, y, zoom) {
	const n = Math.pow(2, zoom);
	const lon = (x / n) * 360 - 180;
	const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
	const lat = (latRad * 180) / Math.PI;
	return { lat, lon };
}

function procesarCSVVehiculos(content, gui) {
	const sep = ','; // separador ,
	const lines = content.split('\n');

	// Primera línea es el encabezado
	// const headers = lines[0].split(sep);

	// Obtiene índices de columnas de interés
	const indices = {
		id: 0,
		vehicle_identifier: 1,
		longitude: 2,
		latitude: 3,
		date_time: 4,
	};

	// Límites del mapa
	const MAP_BOUNDS = {
		minLon: -15.8443,
		maxLon: -15.3479,
		minLat: 27.7328,
		maxLat: 28.1852,
	};

	// Procesa datos
	for (let i = 1; i < lines.length; i++) {
		const columns = lines[i].split(sep);
		if (columns.length > 1) {
			const lon = parseFloat(columns[indices.longitude]);
			const lat = parseFloat(columns[indices.latitude].replace(/["\r]/g, ''));

			// Parse date_time to Date object
			const dateTimeString = columns[indices.date_time].replace(/["\r]/g, '');
			const dateTime = new Date(dateTimeString);

			const vehicleIdentifier = columns[indices.vehicle_identifier].replace(
				/["\r]/g,
				''
			);

			// Verifica si las coordenadas están dentro de los límites
			if (
				lon >= MAP_BOUNDS.minLon &&
				lon <= MAP_BOUNDS.maxLon &&
				lat >= MAP_BOUNDS.minLat &&
				lat <= MAP_BOUNDS.maxLat
			) {
				vehicleData.push({
					id: columns[indices.id],
					vehicle_identifier: vehicleIdentifier,
					longitude: lon,
					latitude: lat,
					date_time: dateTime, // Store as Date object
				});
			}
		}
	}

	console.log(
		`Datos de vehículos cargados: ${vehicleData.length} puntos válidos`
	);

	// Después de cargar los datos, procesarlos para crear trayectorias
	processVehicleData(gui);
}

function processVehicleData(gui) {
	// Group data by vehicle_identifier
	vehicleData.forEach((record) => {
		const vehicleId = record.vehicle_identifier;
		if (!vehicleTrajectories[vehicleId]) {
			vehicleTrajectories[vehicleId] = [];
		}
		vehicleTrajectories[vehicleId].push(record);
	});

	// Sort each trajectory by date_time
	for (const vehicleId in vehicleTrajectories) {
		vehicleTrajectories[vehicleId].sort((a, b) => a.date_time - b.date_time);

		// Create the trajectory path
		const trajectory = vehicleTrajectories[vehicleId];
		const positions = [];
		const times = [];

		trajectory.forEach((record) => {
			const x = Mapeo(record.longitude, minlon, maxlon, -mapsx / 2, mapsx / 2);
			const y = Mapeo(record.latitude, minlat, maxlat, -mapsy / 2, mapsy / 2);
			positions.push(x, y, 0.01);
			times.push(record.date_time.getTime() / 1000); // Convert to seconds
		});

		// Create the line geometry
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(positions, 3)
		);
		geometry.setAttribute('time', new THREE.Float32BufferAttribute(times, 1));

		// Create the line material
		const material = new THREE.ShaderMaterial({
			uniforms: {
				currentTime: currentTimeUniform,
				fadeDuration: fadeDurationUniform,
				colorStart: { value: new THREE.Color(0x00ff00) }, // Color inicial
				colorEnd: { value: new THREE.Color(0x000fff) }, // Color final
				mostrarRutasCompletadas: { value: guiParams.mostrarRutasCompletadas },
			},
			vertexShader: `
				attribute float time;
				varying float vTime;
				varying vec3 vPosition;
				varying vec2 vUv;

				void main() {
					vTime = time;
					vPosition = position;
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform float currentTime;
				uniform float fadeDuration;
				uniform bool mostrarRutasCompletadas;
				uniform vec3 colorStart;
				uniform vec3 colorEnd;
				varying float vTime;
				varying vec3 vPosition;
				varying vec2 vUv;

				float random(vec2 st) {
					return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
				}

				void main() {
					float timeDiff = currentTime - vTime;
					
					if (timeDiff >= 0.0 && timeDiff <= fadeDuration) {
						// Active route - Fade effect
						float t = timeDiff / fadeDuration;
						vec3 color = mix(colorStart, colorEnd, t);
						
						// Add pulsating particles
						float pulse = sin(t * 3.14159 * 2.0 + vPosition.x * 20.0);
						float glow = 0.9 + 0.5 * pulse;
						
						// Add noise effect
						float noise = random(vec2(vPosition.x * 10.0, currentTime));
						float dataEffect = step(0.97, noise);
						
						color = mix(color * glow, vec3(1.0), dataEffect * 0.5);
						gl_FragColor = vec4(color, 1.0);
						
					} else if (mostrarRutasCompletadas && timeDiff > fadeDuration) {
						// Completed route - Plasma effect
						float t = currentTime * 2.0;
						
						// Plasma effect
						float wave1 = sin(vPosition.x * 10.0 + t);
						float wave2 = cos(vPosition.y * 8.0 + t * 1.5);
						float plasma = (wave1 + wave2) * 0.5;
						
						// Hot and cool colors
						vec3 hotColor = vec3(0.8, 0.2, 0.2);
						vec3 coolColor = vec3(0.7, 0.0, 0.0);
						
						// Add distortion effect
						float distortion = sin(vPosition.x * 20.0 + currentTime * 3.0) * 0.1;
						plasma += distortion;
						
						// Mix colors based on plasma value
						vec3 finalColor = mix(coolColor, hotColor, plasma);
						finalColor *= 1.0 + 0.3 * sin(currentTime * 5.0);
						
						gl_FragColor = vec4(finalColor, 0.9);
					} else {
						discard;
					}
				}
			`,
			transparent: true,
		});

		// Create the line mesh
		const line = new THREE.Line(geometry, material);
		scene.add(line);

		// Store the mesh for visibility control
		vehicleMeshes[vehicleId] = line;
	}

	// Update vehicleId options in GUI
	const vehicleIds = Object.keys(vehicleTrajectories);
	const vehicleIdOptions = { Todos: null };
	vehicleIds.forEach((id) => {
		vehicleIdOptions[id] = id;
	});

	guiParams.vehicleIdController.options(vehicleIdOptions);
}

function updateVehicleVisibility() {
	for (const id in vehicleMeshes) {
		if (guiParams.vehicleId === null || guiParams.vehicleId === id) {
			vehicleMeshes[id].visible = true;
		} else {
			vehicleMeshes[id].visible = false;
		}
	}
}

function updateShaders() {
	for (const id in vehicleMeshes) {
		const material = vehicleMeshes[id].material;
		material.uniforms.mostrarRutasCompletadas.value =
			guiParams.mostrarRutasCompletadas;
		material.needsUpdate = true;
	}
}

function Mapeo(val, vmin, vmax, dmin, dmax) {
	// Normaliza valor en el rango de partida, t=0 en vmin, t=1 en vmax
	let t = (val - vmin) / (vmax - vmin);
	return dmin + t * (dmax - dmin);
}

function actualizarFecha() {
	if (guiParams.isAnimating === false) {
		return;
	} 
	
	const deltaTime = clock.getDelta(); // seconds since last call
	totalSegundos += deltaTime; // Incrementa en tiempo real
	fechaActual = new Date(fechaInicio.getTime() + totalSegundos * 2000000);

	if (fechaActual.getTime() > new Date('2024-10-29T23:59:00').getTime()) {
		return;
	}

	// Update currentTimeUniform
	currentTimeUniform.value = fechaActual.getTime() / 1000; // Convert to seconds

	// Formatea salida
	const opciones = {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false, // Para formato 24 horas
	};

	// Modifica en pantalla
	const dateText = document.querySelector('#elapsed-time');

	dateText.innerHTML = fechaActual
		.toLocaleTimeString('es-ES', opciones)
		.replace(/\s/g, '');
}

// Bucle de animación
function animate() {
	// Actualiza hora actual
	actualizarFecha();

	requestAnimationFrame(animate);
	renderer.render(scene, camera);
}
