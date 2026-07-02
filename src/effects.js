import * as THREE from 'three';

// Short-lived visuals: tracers, impact sparks, muzzle flashes, death bursts.
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

  explosion(pos, color = 0xff5533) {
    this.burst(pos, color, 40, 7, 0.7);
    const light = new THREE.PointLight(color, 30, 12);
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
