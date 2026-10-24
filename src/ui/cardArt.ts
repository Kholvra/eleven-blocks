import cardArt from '../data/card-art.json';
import bicycleThumb from '../assets/3d/thumbs/bicycle.png';
import buildingThumb from '../assets/3d/thumbs/building.png';
import busThumb from '../assets/3d/thumbs/bus.png';
import busStopThumb from '../assets/3d/thumbs/busStop.png';
import dumpsterThumb from '../assets/3d/thumbs/dumpster.png';
import marketThumb from '../assets/3d/thumbs/market.png';
import parkThumb from '../assets/3d/thumbs/park.png';
import recycleBinThumb from '../assets/3d/thumbs/recycleBin.png';
import roadThumb from '../assets/3d/thumbs/road.png';
import treeThumb from '../assets/3d/thumbs/tree.png';
import airIcon from '../assets/icons/cat-air.svg';
import energyIcon from '../assets/icons/cat-energi.svg';
import housingIcon from '../assets/icons/cat-permukiman.svg';
import wasteIcon from '../assets/icons/cat-sampah.svg';
import transportIcon from '../assets/icons/cat-transport.svg';
import greenIcon from '../assets/icons/cat-hijau.svg';
import economyIcon from '../assets/icons/cat-ekonomi.svg';
import landUseIcon from '../assets/icons/cat-tata-guna-lahan.svg';
import dialogIcon from '../assets/icons/act-dialog.svg';
import deliberationIcon from '../assets/icons/act-musrenbang.svg';
import riverIcon from '../assets/icons/act-gotong.svg';
import studyIcon from '../assets/icons/act-studi.svg';

const modelImages: Record<string, string> = {
  bicycle: bicycleThumb,
  building: buildingThumb,
  bus: busThumb,
  busStop: busStopThumb,
  dumpster: dumpsterThumb,
  market: marketThumb,
  park: parkThumb,
  recycleBin: recycleBinThumb,
  road: roadThumb,
  tree: treeThumb,
};

const categoryIcons: Record<string, string> = {
  transport: transportIcon,
  'tata-guna-lahan': landUseIcon,
  air: airIcon,
  sampah: wasteIcon,
  hijau: greenIcon,
  energi: energyIcon,
  permukiman: housingIcon,
  ekonomi: economyIcon,
};

const actionIcons: Record<string, string> = {
  ACT01: dialogIcon,
  ACT02: deliberationIcon,
  ACT03: riverIcon,
  ACT04: studyIcon,
};

export function modelImageForCard(cardId: string, category: string): string {
  const model = (cardArt.modelByCardId as Record<string, string>)[cardId]
    ?? (cardArt.modelByCategory as Record<string, string>)[category]
    ?? 'building';
  return modelImages[model] ?? buildingThumb;
}

export function modelImageForAction(actionId: string): string {
  const model = (cardArt.modelByActionId as Record<string, string>)[actionId] ?? 'building';
  return modelImages[model] ?? buildingThumb;
}

export function categoryIconFor(category: string): string | undefined {
  return categoryIcons[category];
}

export function actionIconFor(actionId: string): string | undefined {
  return actionIcons[actionId];
}
