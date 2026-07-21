import { useMemo } from "react";

// A simple bounded room standing in for one Hohenberg floor — real map
// generation (MapGenerator.ts) is 2D-tile/isometric-specific and gets ported
// to a real 3D layout system later. This is deliberately a single flat arena
// for the first playable slice.
const HALF_SIZE = 14;
const WALL_HEIGHT = 4;

export function Arena() {
  const pillarPositions = useMemo(() => {
    const pts: [number, number][] = [];
    for (let x = -8; x <= 8; x += 8) {
      for (let z = -8; z <= 8; z += 8) {
        if (x === 0 && z === 0) continue;
        pts.push([x, z]);
      }
    }
    return pts;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[HALF_SIZE * 2, HALF_SIZE * 2]} />
        <meshStandardMaterial color="#2a2a38" roughness={0.9} />
      </mesh>

      {/* Perimeter walls */}
      <mesh position={[0, WALL_HEIGHT / 2, -HALF_SIZE]} castShadow receiveShadow>
        <boxGeometry args={[HALF_SIZE * 2, WALL_HEIGHT, 0.6]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, HALF_SIZE]} castShadow receiveShadow>
        <boxGeometry args={[HALF_SIZE * 2, WALL_HEIGHT, 0.6]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
      <mesh position={[-HALF_SIZE, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, WALL_HEIGHT, HALF_SIZE * 2]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
      <mesh position={[HALF_SIZE, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, WALL_HEIGHT, HALF_SIZE * 2]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>

      {pillarPositions.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.5, z]} castShadow receiveShadow>
          <boxGeometry args={[1, 3, 1]} />
          <meshStandardMaterial color="#4a4a5c" />
        </mesh>
      ))}
    </group>
  );
}

export const ARENA_HALF_SIZE = HALF_SIZE;
