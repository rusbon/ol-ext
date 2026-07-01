/*	Copyright (c) 2016 Jean-Marc VIGLINO, 
  released under the CeCILL-B license (French BSD license)
  (http://www.cecill.info/licences/Licence_CeCILL-B_V1-en.txt).
*/

import ol_style_Style from "ol/style/Style.js";
import ol_style_Icon from "ol/style/Icon.js";
import ol_extent_Extent from "ol/extent";
import { Coordinate as ol_coordinate_Coordinate } from "ol/coordinate.js";
import { State as ol_render_State } from "ol/render.js";
import { Map as ol_Map } from "ol";

/**
 * @classdesc
 * Applies an image-based stroke to vector features
 *
 * @constructor
 * @param {Object} options
 *  @param {ol_style_Icon} options.icon Icon style to be applied to stroke
 *  @param {`#${string}`} [options.fallbackColor] Alternative stroke if segment length is less than image width
 *  @param {boolean} [options.isVectorTile] Toggle to true if applying stroke into VectorTile layer
 * @extends {ol_style_Style}
 * @api
 */
var ol_style_StrokeImage = class olstyleStrokeImage extends ol_style_Style {
  /**
   * @param {Object} options
   *  @param {ol_style_Icon} options.icon Icon style to be applied to stroke
   *  @param {`#${string}`} [options.fallbackColor] Alternative stroke if segment length is less than image width
   *  @param {boolean} [options.isVectorTile] Toggle to true if applying stroke into VectorTile layer
   *  @param {ol_Map} [options.map] Toggle to true if applying stroke into VectorTile layer
   */
  constructor(options) {
    super({ renderer: (a, b) => this.renderer(a, b) });
    this.icon = options.icon;
    this.fallbackColor = options.fallbackColor;
    this.isVectorTile = options.isVectorTile;
    this.map = options.map;

    if (this.icon) this.icon.load();
  }

  /**
   *
   * @param {ol_coordinate_Coordinate | ol_coordinate_Coordinate[] | ol_coordinate_Coordinate[][] | ol_coordinate_Coordinate[][][]} pixelCoordinates
   * @param {ol_render_State} state
   */
  renderer(pixelCoordinates, state) {
    if (!["LineString", "Polygon"].includes(state.geometry.getType())) {
      return;
    }

    const ctx = state.context;

    /**
     *
     * @param {ol_coordinate_Coordinate[]} coordinates
     * @param {boolean} checkExtent
     * @returns
     */
    const draw = (coordinates, checkExtent = false) => {
      const ps = coordinates.slice(0, 12);
      const extent = state.geometry.getExtent();
      const flatCoords = state.geometry.getFlatCoordinates();
      let pLength =
        state.geometry.getType() == "Polygon" ? ps.length - 1 : ps.length - 1;

      for (let i = 0; i < pLength; i++) {
        const p1 = ps[i];
        const p2 = ps[i + 1];

        if (checkExtent) {
          if (!checkExtentIntersection(extent, p1, p2)) continue;
        }

        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const rotation = Math.atan2(dy, dx);

        const icon = this.icon;
        const iconWidth = icon.getWidth();
        const iconHeight = icon.getHeight();
        const iconOrigin = icon.getOrigin();

        const segments = this.splitLineIntoSegments(p1, p2, iconWidth || 1);

        for (let j = 0; j < segments.length; j++) {
          const { p, length } = segments[j];

          if (
            !this.fallbackColor ||
            (length == (iconWidth || 1) && segments.length > 2)
          ) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(p[0], p[1]);
            ctx.rotate(rotation);
            ctx.drawImage(
              icon.getImage(),
              iconOrigin[0],
              iconOrigin[1],
              length,
              iconHeight,
              0,
              -iconHeight / 2,
              length,
              iconHeight,
            );
            ctx.restore();
          } else {
            const nextSegment = segments[j + 1];
            if (!nextSegment) continue;
            if (this.fallbackColor) ctx.strokeStyle = this.fallbackColor;
            ctx.lineWidth = 1;
            const p0 = p;
            const p1 = nextSegment.p;
            ctx.beginPath();
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
    };

    switch (state.geometry.getType()) {
      case "LineString":
      default:
        draw(pixelCoordinates);
        break;
      case "Polygon":
        for (let i = 0; i < pixelCoordinates.length; i++) {
          const _pixelCoordinates = pixelCoordinates;

          draw(_pixelCoordinates[i], this.isVectorTile);
        }
        break;
    }
  }

  /**
   *
   * @param {number[]} p1
   * @param {number[]} p2
   * @param {number} segmentLength
   * @returns {{ p: [number, number]; length: number }[]}
   */
  splitLineIntoSegments(p1, p2, segmentLength) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const totalDistance = Math.sqrt(dx * dx + dy * dy);

    if (totalDistance <= segmentLength || segmentLength <= 0) {
      return [
        { p: [p1[0], p1[1]], length: totalDistance },
        { p: [p2[0], p2[1]], length: 0 },
      ];
    }

    let trDistance = totalDistance - segmentLength;
    const numSegments = Math.floor(totalDistance / segmentLength);
    const segments = [
      {
        p: [p1[0], p1[1]],
        length: numSegments > 1 ? segmentLength : segmentLength,
      },
    ];

    for (let i = 1; i <= numSegments; i++) {
      const t = (i * segmentLength) / totalDistance;
      const x = p1[0] + t * dx;
      const y = p1[1] + t * dy;
      segments.push({
        p: [x, y],
        length: i < numSegments ? segmentLength : trDistance,
      });
      trDistance -= segmentLength;
    }

    segments.push({
      p: [p2[0], p2[1]],
      length: 0,
    });

    return segments;
  }

  /**
   *
   * @param {ol_extent_Extent} Extent
   * @param {ol_coordinate_Coordinate} p1
   * @param {ol_coordinate_Coordinate} p2
   */
  checkExtentIntersection(extent, p1, p2) {
    const pc1 = this.map.getCoordinateFromPixel(p1);
    const pc2 = this.map.getCoordinateFromPixel(p2);

    if (
      (pc1[0] <= extent[0] && pc2[0] <= extent[0]) ||
      (pc1[0] >= extent[2] && pc2[0] >= extent[2])
    )
      return false;

    if (
      (pc1[1] <= extent[1] && pc2[1] <= extent[1]) ||
      (pc1[1] <= extent[3] && pc2[1] >= extent[3])
    )
      return false;

    return true;
  }
};

export default ol_style_StrokeImage;
