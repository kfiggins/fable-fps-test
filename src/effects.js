import * as THREE from 'three';

// Short-lived visuals: tracers, impact sparks, muzzle flashes, death bursts,
// debris chunks, shockwave rings, spawn beams.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  tracer(from, to, color = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.09, max: 0.09 });
  }

  burst(pos, color, count, speed, life) {
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const v = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.3,
        Math.random() - 0.5
      ).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      velocities.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.09,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.items.push({ obj: points, life, max: life, velocities });
  }

  spark(pos, color = 0xffcc88) {
    this.burst(pos, color, 8, 4, 0.25);
  }

  explosion(pos, color = 0xff5533, scale = 1) {
    this.burst(pos, color, Math.round(40 * scale), 7 * scale, 0.7);
    const light = new THREE.PointLight(color, 30 * scale, 12 * scale);
    light.position.copy(pos);
    this.scene.add(light);
    this.items.push({ obj: light, life: 0.15, max: 0.15, isLight: true });
  }

  flash(pos, color = 0xffd27a) {
    const light = new THREE.PointLight(color, 8, 6);
    light.position.copy(pos);
    this.scene.add(light);
    this.items.push({ obj: light, life: 0.06, max: 0.06, isLight: true });
  }

  // tumbling box chunks with gravity — bot gibs
  debris(pos, color, count = 6, scale = 1) {
    for (let i = 0; i < count; i++) {
      const size = (0.1 + Math.random() * 0.12) * scale;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color, transparent: true, roughness: 0.8 })
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.items.push({
        obj: mesh,
        life: 0.9,
        max: 0.9,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8 * scale,
          2 + Math.random() * 5 * scale,
          (Math.random() - 0.5) * 8 * scale
        ),
        angVel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        isDebris: true,
      });
    }
  }

  // expanding ground ring — boss stomp
  shockwave(pos, radius = 7, color = 0xffaa44) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.15, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    this.scene.add(mesh);
    this.items.push({ obj: mesh, life: 0.45, max: 0.45, growTo: radius, isRing: true });
  }

  // vertical light column — enemy spawn-in
  beam(pos, color = 0x9fd8ff) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    mesh.position.set(pos.x, 3.5, pos.z);
    this.scene.add(mesh);
    this.items.push({ obj: mesh, life: 0.4, max: 0.4, isBeam: true });
    this.burst(new THREE.Vector3(pos.x, 1, pos.z), color, 14, 3, 0.4);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.scene.remove(item.obj);
        if (item.obj.geometry) item.obj.geometry.dispose();
        if (item.obj.material) item.obj.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      const t = item.life / item.max;
      if (item.isLight) {
        item.obj.intensity *= t;
      } else if (item.isDebris) {
        item.vel.y -= 18 * dt;
        item.obj.position.addScaledVector(item.vel, dt);
        if (item.obj.position.y < 0.06) {
          item.obj.position.y = 0.06;
          item.vel.y *= -0.3;
          item.vel.x *= 0.6;
          item.vel.z *= 0.6;
        }
        item.obj.rotation.x += item.angVel.x * dt;
        item.obj.rotation.y += item.angVel.y * dt;
        item.obj.rotation.z += item.angVel.z * dt;
        item.obj.material.opacity = Math.min(1, t * 2);
      } else if (item.isRing) {
        const grown = 1 + (1 - t) * item.growTo;
        item.obj.scale.set(grown, grown, 1);
        item.obj.material.opacity = t * 0.9;
      } else if (item.isBeam) {
        item.obj.scale.x = item.obj.scale.z = t;
        item.obj.material.opacity = t * 0.55;
      } else if (item.velocities) {
        const arr = item.obj.geometry.attributes.position.array;
        for (let j = 0; j < item.velocities.length; j++) {
          const v = item.velocities[j];
          v.y -= 12 * dt;
          arr[j * 3] += v.x * dt;
          arr[j * 3 + 1] += v.y * dt;
          arr[j * 3 + 2] += v.z * dt;
        }
        item.obj.geometry.attributes.position.needsUpdate = true;
        item.obj.material.opacity = t;
      } else {
        item.obj.material.opacity = t * 0.9;
      }
    }
  }
}
