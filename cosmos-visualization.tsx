import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

interface StarData {
  id?: string | number;
  name?: string;
  ra?: number;        // Right ascension (hours)
  dec?: number;       // Declination (degrees)
  mag?: number;       // Magnitude (brightness)
  bv?: number;        // B-V color index
  distance?: number;  // Distance in parsecs
  x?: number;         // Direct cartesian coordinates
  y?: number;
  z?: number;
  spectralClass?: string;
}

const CosmosVisualization: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const frameRef = useRef<number>();
  const controlsRef = useRef<{
    mouseDown: boolean;
    mouseX: number;
    mouseY: number;
    targetRotationX: number;
    targetRotationY: number;
    currentRotationX: number;
    currentRotationY: number;
    zoom: number;
    targetZoom: number;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    baseSpeed: number;
    acceleratedSpeed: number;
    isAccelerating: boolean;
    keys: { [key: string]: boolean };
  }>({
    mouseDown: false,
    mouseX: 0,
    mouseY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    currentRotationX: 0,
    currentRotationY: 0,
    zoom: 500,
    targetZoom: 500,
    velocity: new THREE.Vector3(0, 0, 0),
    acceleration: new THREE.Vector3(0, 0, 0),
    baseSpeed: 5,
    acceleratedSpeed: 50,
    isAccelerating: false,
    keys: {}
  });

  const [starCount, setStarCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [movementSpeed, setMovementSpeed] = useState(5);
  const [isFlying, setIsFlying] = useState(false);
  
  const starsGroupRef = useRef<THREE.Group>();
  const raycasterRef = useRef<THREE.Raycaster>();
  const mouseRef = useRef<THREE.Vector2>();
  const [hoveredStar, setHoveredStar] = useState<StarData | null>(null);

  // Convert astronomical coordinates to 3D cartesian
  const astronomicalToCartesian = (ra: number, dec: number, distance: number = 50): THREE.Vector3 => {
    // Convert RA from hours to radians, DEC from degrees to radians
    const raRad = (ra * 15) * (Math.PI / 180); // RA in hours * 15 = degrees
    const decRad = dec * (Math.PI / 180);
    
    // Spherical to cartesian conversion
    const x = distance * Math.cos(decRad) * Math.cos(raRad);
    const y = distance * Math.sin(decRad);
    const z = distance * Math.cos(decRad) * Math.sin(raRad);
    
    return new THREE.Vector3(x, y, z);
  };

  // Get star color from B-V color index or spectral class
  const getStarColor = (bv?: number, spectralClass?: string): THREE.Color => {
    if (bv !== undefined) {
      // B-V color index to RGB conversion (approximate)
      let r, g, b;
      if (bv < -0.4) {       // Very blue stars
        r = 0.6; g = 0.8; b = 1.0;
      } else if (bv < 0) {   // Blue stars
        r = 0.8; g = 0.9; b = 1.0;
      } else if (bv < 0.5) { // White stars
        r = 1.0; g = 1.0; b = 1.0;
      } else if (bv < 1.0) { // Yellow stars
        r = 1.0; g = 1.0; b = 0.7;
      } else if (bv < 1.5) { // Orange stars
        r = 1.0; g = 0.7; b = 0.4;
      } else {               // Red stars
        r = 1.0; g = 0.5; b = 0.3;
      }
      return new THREE.Color(r, g, b);
    }
    
    if (spectralClass) {
      const type = spectralClass.charAt(0).toUpperCase();
      switch (type) {
        case 'O': return new THREE.Color(0.6, 0.8, 1.0);  // Blue
        case 'B': return new THREE.Color(0.8, 0.9, 1.0);  // Blue-white
        case 'A': return new THREE.Color(1.0, 1.0, 1.0);  // White
        case 'F': return new THREE.Color(1.0, 1.0, 0.9);  // Yellow-white
        case 'G': return new THREE.Color(1.0, 1.0, 0.7);  // Yellow
        case 'K': return new THREE.Color(1.0, 0.7, 0.4);  // Orange
        case 'M': return new THREE.Color(1.0, 0.5, 0.3);  // Red
        default: return new THREE.Color(1.0, 1.0, 1.0);   // Default white
      }
    }
    
    // Default color with some variation
    return new THREE.Color(0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2);
  };

  // Convert magnitude to size (brighter stars = larger size)
  const magnitudeToSize = (mag?: number): number => {
    if (mag === undefined) return 1.0;
    
    // Magnitude scale is inverted (lower = brighter)
    // Scale from 0.5 to 3.0 pixels
    const size = Math.max(0.5, 3.0 - (mag + 2) * 0.5);
    return size;
  };

  // Generate sample star data if no data.json is available
  const generateSampleStarData = (): StarData[] => {
    const sampleStars: StarData[] = [];
    
    // Add some famous stars with real data
    const famousStars = [
      { name: "Sirius", ra: 6.75, dec: -16.72, mag: -1.46, bv: 0.00, spectralClass: "A1V" },
      { name: "Canopus", ra: 6.4, dec: -52.7, mag: -0.74, bv: 0.15, spectralClass: "A9II" },
      { name: "Arcturus", ra: 14.26, dec: 19.18, mag: -0.05, bv: 1.23, spectralClass: "K1.5III" },
      { name: "Vega", ra: 18.62, dec: 38.78, mag: 0.03, bv: 0.00, spectralClass: "A0V" },
      { name: "Capella", ra: 5.28, dec: 45.99, mag: 0.08, bv: 0.80, spectralClass: "G5III" },
      { name: "Rigel", ra: 5.24, dec: -8.20, mag: 0.13, bv: -0.03, spectralClass: "B8Iae" },
      { name: "Procyon", ra: 7.65, dec: 5.23, mag: 0.34, bv: 0.42, spectralClass: "F5IV-V" },
      { name: "Betelgeuse", ra: 5.92, dec: 7.41, mag: 0.50, bv: 1.85, spectralClass: "M1-2Ia-Iab" },
      { name: "Achernar", ra: 1.63, dec: -57.24, mag: 0.46, bv: -0.19, spectralClass: "B6Vep" },
      { name: "Altair", ra: 19.85, dec: 8.87, mag: 0.77, bv: 0.22, spectralClass: "A7V" }
    ];
    
    sampleStars.push(...famousStars);
    
    // Generate additional random stars
    for (let i = 0; i < 2000; i++) {
      sampleStars.push({
        id: i + famousStars.length,
        name: `Star-${i}`,
        ra: Math.random() * 24,
        dec: (Math.random() - 0.5) * 180,
        mag: Math.random() * 8 - 1, // -1 to 7 magnitude range
        bv: (Math.random() - 0.3) * 2, // -0.3 to 1.7 B-V range
        spectralClass: ['O', 'B', 'A', 'F', 'G', 'K', 'M'][Math.floor(Math.random() * 7)]
      });
    }
    
    return sampleStars;
  };

  // Load and parse star data
  const loadStarData = useCallback(async (): Promise<StarData[]> => {
    try {
      setLoading(true);
      setError('');
      
      // Try to read the data.json file
      let starData: StarData[] = [];
      
      try {
        if (window.fs && window.fs.readFile) {
          const fileData = await window.fs.readFile('data.json', { encoding: 'utf8' });
          const parsed = JSON.parse(fileData);
          
          // Handle different JSON structures
          if (Array.isArray(parsed)) {
            starData = parsed;
          } else if (parsed.stars && Array.isArray(parsed.stars)) {
            starData = parsed.stars;
          } else if (parsed.catalog && Array.isArray(parsed.catalog)) {
            starData = parsed.catalog;
          } else {
            throw new Error('Invalid JSON structure');
          }
          
          console.log(`Loaded ${starData.length} stars from data.json`);
        } else {
          throw new Error('File system not available');
        }
      } catch (fileError) {
        console.log('Could not load data.json, using sample data:', fileError);
        starData = generateSampleStarData();
      }
      
      setStarCount(starData.length);
      return starData;
      
    } catch (err) {
      setError(`Error loading star data: ${err}`);
      return generateSampleStarData();
    } finally {
      setLoading(false);
    }
  }, []);

  // Create star visualization
  const createStarVisualization = useCallback(async () => {
    if (!mountRef.current) return;

    const starData = await loadStarData();

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 0, controlsRef.current.zoom);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // Raycaster for mouse interaction
    raycasterRef.current = new THREE.Raycaster();
    mouseRef.current = new THREE.Vector2();

    // Keyboard event listeners
    const handleKeyDown = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      controls.keys[event.code] = true;
      
      // Update acceleration flag
      controls.isAccelerating = controls.keys['ShiftLeft'] || controls.keys['ShiftRight'];
      setIsFlying(Object.values(controls.keys).some(pressed => pressed));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      controls.keys[event.code] = false;
      
      // Update acceleration flag
      controls.isAccelerating = controls.keys['ShiftLeft'] || controls.keys['ShiftRight'];
      setIsFlying(Object.values(controls.keys).some(pressed => pressed));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Create stars group
    const starsGroup = new THREE.Group();
    scene.add(starsGroup);
    starsGroupRef.current = starsGroup;

    // Create individual star geometries and materials
    const starGeometries: THREE.BufferGeometry[] = [];
    const starMaterials: THREE.PointsMaterial[] = [];
    const starMeshes: THREE.Points[] = [];
    const starMetadata: StarData[] = [];

    starData.forEach((star, index) => {
      let position: THREE.Vector3;

      // Use direct coordinates if available, otherwise convert from astronomical coordinates
      if (star.x !== undefined && star.y !== undefined && star.z !== undefined) {
        position = new THREE.Vector3(star.x, star.y, star.z);
      } else if (star.ra !== undefined && star.dec !== undefined) {
        const distance = star.distance || 50 + Math.random() * 200;
        position = astronomicalToCartesian(star.ra, star.dec, distance);
      } else {
        // Random position fallback
        position = new THREE.Vector3(
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 1000,
          (Math.random() - 0.5) * 1000
        );
      }

      // Create geometry for single star
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([position.x, position.y, position.z], 3));

      // Create material with star properties
      const color = getStarColor(star.bv, star.spectralClass);
      const size = magnitudeToSize(star.mag);
      
      const material = new THREE.PointsMaterial({
        color: color,
        size: size,
        transparent: true,
        opacity: Math.max(0.3, 1.0 - (star.mag || 0) * 0.1),
        sizeAttenuation: true
      });

      const starMesh = new THREE.Points(geometry, material);
      starMesh.userData = { ...star, index };
      
      starsGroup.add(starMesh);
      
      starGeometries.push(geometry);
      starMaterials.push(material);
      starMeshes.push(starMesh);
      starMetadata.push(star);
    });

    // Add some nebula-like background particles
    const nebulaGeometry = new THREE.BufferGeometry();
    const nebulaPositions = new Float32Array(1000 * 3);
    const nebulaColors = new Float32Array(1000 * 3);

    for (let i = 0; i < 1000; i++) {
      nebulaPositions[i * 3] = (Math.random() - 0.5) * 2000;
      nebulaPositions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
      nebulaPositions[i * 3 + 2] = (Math.random() - 0.5) * 2000;

      const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.5, 0.3);
      nebulaColors[i * 3] = color.r;
      nebulaColors[i * 3 + 1] = color.g;
      nebulaColors[i * 3 + 2] = color.b;
    }

    nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(nebulaPositions, 3));
    nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(nebulaColors, 3));

    const nebulaMaterial = new THREE.PointsMaterial({
      size: 4,
      transparent: true,
      opacity: 0.1,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });

    const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    scene.add(nebula);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      // Update controls
      const controls = controlsRef.current;
      
      // Handle keyboard movement
      const moveVector = new THREE.Vector3();
      const currentSpeed = controls.isAccelerating ? controls.acceleratedSpeed : controls.baseSpeed;
      
      // Movement inputs
      if (controls.keys['KeyW'] || controls.keys['ArrowUp']) {
        moveVector.z -= currentSpeed;
      }
      if (controls.keys['KeyS'] || controls.keys['ArrowDown']) {
        moveVector.z += currentSpeed;
      }
      if (controls.keys['KeyA'] || controls.keys['ArrowLeft']) {
        moveVector.x -= currentSpeed;
      }
      if (controls.keys['KeyD'] || controls.keys['ArrowRight']) {
        moveVector.x += currentSpeed;
      }
      if (controls.keys['KeyQ'] || controls.keys['Space']) {
        moveVector.y += currentSpeed;
      }
      if (controls.keys['KeyE'] || controls.keys['ControlLeft']) {
        moveVector.y -= currentSpeed;
      }

      // Apply movement relative to camera orientation
      if (moveVector.length() > 0) {
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, camera.up).normalize();
        
        const up = new THREE.Vector3();
        up.crossVectors(right, cameraDirection).normalize();
        
        // Create movement in world space
        const worldMovement = new THREE.Vector3();
        worldMovement.addScaledVector(cameraDirection, -moveVector.z);
        worldMovement.addScaledVector(right, moveVector.x);
        worldMovement.addScaledVector(up, moveVector.y);
        
        // Apply movement with acceleration/deceleration
        controls.acceleration.copy(worldMovement);
        controls.velocity.lerp(controls.acceleration, 0.1);
        
        // Update camera position
        camera.position.add(controls.velocity);
        
        // Update movement speed display
        setMovementSpeed(controls.velocity.length());
      } else {
        // Decelerate when no input
        controls.velocity.multiplyScalar(0.9);
        controls.acceleration.set(0, 0, 0);
        
        if (controls.velocity.length() < 0.1) {
          controls.velocity.set(0, 0, 0);
          setMovementSpeed(0);
        } else {
          setMovementSpeed(controls.velocity.length());
        }
      }
      
      // Smooth rotation (only when not using WASD movement)
      if (!controls.keys['KeyW'] && !controls.keys['KeyS'] && !controls.keys['KeyA'] && !controls.keys['KeyD']) {
        controls.currentRotationX += (controls.targetRotationX - controls.currentRotationX) * 0.05;
        controls.currentRotationY += (controls.targetRotationY - controls.currentRotationY) * 0.05;
        
        // Apply orbital rotation around origin
        const orbitPosition = new THREE.Vector3(
          Math.sin(controls.currentRotationY) * controls.zoom,
          Math.sin(controls.currentRotationX) * controls.zoom * 0.5,
          Math.cos(controls.currentRotationY) * controls.zoom
        );
        
        // Only apply orbital movement if not actively flying
        if (controls.velocity.length() < 0.1) {
          camera.position.copy(orbitPosition);
          camera.lookAt(0, 0, 0);
        }
      }
      
      // Smooth zoom (only affects orbital mode)
      controls.zoom += (controls.targetZoom - controls.zoom) * 0.1;

      // Subtle nebula rotation
      nebula.rotation.y += 0.0005;
      nebula.rotation.x += 0.0002;

      renderer.render(scene, camera);
    };

    animate();

  }, [loadStarData]);

  // Mouse event handlers
  const handleMouseDown = (event: React.MouseEvent) => {
    const controls = controlsRef.current;
    controls.mouseDown = true;
    controls.mouseX = event.clientX;
    controls.mouseY = event.clientY;
  };

  const handleMouseUp = () => {
    controlsRef.current.mouseDown = false;
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const controls = controlsRef.current;
    
    if (!mountRef.current || !mouseRef.current || !raycasterRef.current || !cameraRef.current) return;

    // Update mouse position for raycasting
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Handle orbit controls
    if (controls.mouseDown) {
      const deltaX = event.clientX - controls.mouseX;
      const deltaY = event.clientY - controls.mouseY;

      controls.targetRotationY += deltaX * 0.01;
      controls.targetRotationX += deltaY * 0.01;
      
      // Limit vertical rotation
      controls.targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, controls.targetRotationX));

      controls.mouseX = event.clientX;
      controls.mouseY = event.clientY;
    }

    // Raycasting for star hover
    if (starsGroupRef.current) {
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(starsGroupRef.current.children);

      if (intersects.length > 0) {
        const starData = intersects[0].object.userData as StarData;
        setHoveredStar(starData);
      } else {
        setHoveredStar(null);
      }
    }
  };

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const controls = controlsRef.current;
    
    const zoomSpeed = controls.zoom * 0.1;
    controls.targetZoom += event.deltaY > 0 ? zoomSpeed : -zoomSpeed;
    controls.targetZoom = Math.max(10, Math.min(2000, controls.targetZoom));
  };

  // Window resize handler
  const handleResize = useCallback(() => {
    if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
    
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  }, []);

  // Initialize visualization
  useEffect(() => {
    createStarVisualization();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [createStarVisualization, handleResize]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Canvas */}
      <div 
        ref={mountRef} 
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      />

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 text-white z-10">
        <h1 className="text-2xl font-bold mb-2">Cosmos Star Catalog</h1>
        <div className="bg-black bg-opacity-50 p-4 rounded-lg backdrop-blur-sm">
          {loading && <p className="text-blue-300">Loading star data...</p>}
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <p className="text-sm text-gray-300">Stars: {starCount.toLocaleString()}</p>
          
          {/* Movement Status */}
          <div className="mt-2 text-xs">
            <div className={`flex items-center ${isFlying ? 'text-green-300' : 'text-gray-400'}`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${isFlying ? 'bg-green-400' : 'bg-gray-400'}`}></div>
              <span>{isFlying ? 'FLYING' : 'ORBIT'}</span>
            </div>
            <p className="text-gray-300 mt-1">Speed: {movementSpeed.toFixed(1)} units/s</p>
          </div>
          
          <div className="mt-3 text-xs text-gray-400">
            <p><strong>Flight Controls:</strong></p>
            <p>• WASD / Arrow Keys: Move</p>
            <p>• Q/Space: Up • E/Ctrl: Down</p>
            <p>• Hold Shift: Accelerate (10x speed)</p>
            <p>• Mouse: Look around</p>
            <p>• Scroll: Zoom (orbit mode)</p>
          </div>
        </div>
      </div>

      {/* Star Information Panel */}
      {hoveredStar && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-70 p-4 rounded-lg backdrop-blur-sm text-white z-10 max-w-xs">
          <h3 className="font-bold text-lg mb-2">{hoveredStar.name || `Star ${hoveredStar.id}`}</h3>
          {hoveredStar.ra !== undefined && (
            <p className="text-sm"><span className="text-blue-300">RA:</span> {hoveredStar.ra.toFixed(2)}h</p>
          )}
          {hoveredStar.dec !== undefined && (
            <p className="text-sm"><span className="text-blue-300">Dec:</span> {hoveredStar.dec.toFixed(2)}°</p>
          )}
          {hoveredStar.mag !== undefined && (
            <p className="text-sm"><span className="text-blue-300">Magnitude:</span> {hoveredStar.mag.toFixed(2)}</p>
          )}
          {hoveredStar.bv !== undefined && (
            <p className="text-sm"><span className="text-blue-300">B-V Index:</span> {hoveredStar.bv.toFixed(2)}</p>
          )}
          {hoveredStar.spectralClass && (
            <p className="text-sm"><span className="text-blue-300">Spectral Class:</span> {hoveredStar.spectralClass}</p>
          )}
          {hoveredStar.distance && (
            <p className="text-sm"><span className="text-blue-300">Distance:</span> {hoveredStar.distance.toFixed(1)} pc</p>
          )}
        </div>
      )}

      {/* Speed Indicator */}
      {isFlying && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 p-3 rounded-lg backdrop-blur-sm text-white z-10">
          <div className="flex items-center space-x-3">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2 animate-pulse"></div>
              <span className="text-sm font-mono">FLIGHT MODE</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-300">Speed: </span>
              <span className={`font-mono ${controlsRef.current?.isAccelerating ? 'text-red-300' : 'text-green-300'}`}>
                {movementSpeed.toFixed(1)}
              </span>
            </div>
            {controlsRef.current?.isAccelerating && (
              <div className="text-xs text-red-300 animate-pulse">
                ⚡ BOOST
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 p-4 rounded-lg backdrop-blur-sm text-white z-10">
        <h4 className="font-bold mb-2">Star Colors</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-300 mr-2"></div>
            <span>O/B - Hot Blue Stars</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-white mr-2"></div>
            <span>A/F - White Stars</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-yellow-300 mr-2"></div>
            <span>G - Yellow Stars (Sun-like)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-orange-400 mr-2"></div>
            <span>K - Orange Stars</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-400 mr-2"></div>
            <span>M - Red Stars</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CosmosVisualization;