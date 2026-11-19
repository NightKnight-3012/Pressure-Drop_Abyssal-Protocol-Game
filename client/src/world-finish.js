import {PMREMGenerator, Vector2} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

export function createWorldFinish(renderer, scene, camera) {
  const room = new RoomEnvironment(renderer);
  const generator = new PMREMGenerator(renderer);
  let reflection;
  try {
    reflection = generator.fromScene(room, .07);
  } finally {
    generator.dispose();
    room.dispose();
  }

  const size = new Vector2();
  let composer, bloom, output, width, height, ratio;

  function releaseBloom() {
    bloom?.dispose();
    output?.dispose();
    composer?.dispose();
    composer = bloom = output = null;
  }

  return {
    configure({quality, reduced}) {
      scene.environment = quality === 'low' ? null : reflection.texture;
      scene.environmentIntensity = .26;
      if (quality === 'low' || reduced) releaseBloom();
    },
    render({quality, reduced}) {
      if (quality === 'low' || reduced) return false;
      if (!composer) {
        composer = new EffectComposer(renderer);
        bloom = new UnrealBloomPass(new Vector2(1, 1), .18, .3, 1.12);
        output = new OutputPass();
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(bloom);
        composer.addPass(output);
        width = height = ratio = 0;
      }
      bloom.strength = quality === 'high' ? .24 : .17;
      renderer.getSize(size);
      const nextRatio = Math.min(renderer.getPixelRatio(), 1.5);
      if (nextRatio !== ratio) {
        ratio = nextRatio;
        composer.setPixelRatio(ratio);
      }
      if (size.x !== width || size.y !== height) {
        width = size.x;
        height = size.y;
        composer.setSize(width, height);
      }
      composer.render();
      return true;
    },
    dispose() {
      releaseBloom();
      scene.environment = null;
      reflection.dispose();
    }
  };
}
