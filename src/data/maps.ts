import village from '../../assets/maps/village.json';
import home from '../../assets/maps/home.json';
import minka from '../../assets/maps/minka.json';
import shop from '../../assets/maps/shop.json';
import forge from '../../assets/maps/forge.json';
import shrine from '../../assets/maps/shrine.json';
import forest from '../../assets/maps/forest.json';

/** 所有地圖（Tiled JSON）。key 就是出口物件 `map` 屬性用的名稱。 */
export const MAPS: Record<string, object> = { village, home, minka, shop, forge, shrine, forest };
