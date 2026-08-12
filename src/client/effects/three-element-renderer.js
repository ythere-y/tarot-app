function seeded(index, salt=0) {
  const value=Math.sin((index+1)*12.9898+salt*78.233)*43758.5453;
  return value-Math.floor(value);
}

export function createThreeElementRenderer({ THREE, scene, profile, anchor }) {
  const count=profile.particleCount;
  const positions=new Float32Array(count*3);
  const seeds=new Float32Array(count*4);
  const colors=new Float32Array(count*3);
  const palette=profile.palette.map(color=>new THREE.Color(color));
  for (let i=0;i<count;i++) {
    const radius=.22+seeded(i,1)*1.25;
    const angle=seeded(i,2)*Math.PI*2;
    positions[i*3]=Math.cos(angle)*radius;
    positions[i*3+1]=(seeded(i,3)-.5)*1.8;
    positions[i*3+2]=(seeded(i,4)-.5)*.45;
    seeds.set([radius,angle,seeded(i,5),seeded(i,6)],i*4);
    const color=palette[i%palette.length]; colors.set([color.r,color.g,color.b],i*3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const material=new THREE.PointsMaterial({size:.075,vertexColors:true,transparent:true,opacity:.15,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geometry,material);
  points.position.set(anchor.x||0,anchor.y||0,(anchor.z||0)+.08);
  scene.add(points);
  let phase='prepared', elapsed=0, disposed=false;

  function updateParticle(i,time) {
    const o=i*3,s=i*4,baseRadius=seeds[s],baseAngle=seeds[s+1],random=seeds[s+2],jitter=seeds[s+3];
    const direction=profile.flow==='inward'?-1:1;
    let radius=baseRadius, angle=baseAngle, y=(random-.5)*1.8;
    if (profile.element==='fire') { radius*=.55; y+=profile.verticalDirection*time*(.35+random*.8); angle+=Math.sin(time*8+jitter*9)*.18*profile.turbulence; }
    if (profile.element==='water') { angle+=time*(.35+random)*direction; radius+=Math.sin(time*2+baseAngle)*.18; y+=Math.sin(angle*2+time)*.12; }
    if (profile.element==='air') { angle+=time*(.8+random)*direction; radius+=direction*time*.08; y+=profile.verticalDirection*time*.15+Math.sin(time*5+jitter*8)*.16; }
    if (profile.element==='earth') { angle+=time*.12*direction; radius+=direction*Math.sin(time+random*6)*.08; y-=profile.verticalDirection*time*(.08+random*.18); }
    positions[o]=Math.cos(angle)*radius; positions[o+1]=y; positions[o+2]=Math.sin(angle)*radius*.2;
  }

  return {
    reveal(){ if(!disposed){phase='revealing'; material.opacity=.92; material.size=.095;} },
    settle(){ if(!disposed){phase='settled'; material.opacity=.58; material.size=.065;} },
    update(dt){ if(disposed)return; elapsed+=Math.min(Math.max(dt||0,0),.1); for(let i=0;i<count;i++)updateParticle(i,elapsed); geometry.attributes.position.needsUpdate=true; points.rotation.z+=dt*.04; },
    dispose(){ if(disposed)return; disposed=true; scene.remove(points); geometry.dispose(); material.dispose(); phase='disposed'; },
    getSnapshot(){return {phase,particleCount:count,disposed};}
  };
}
