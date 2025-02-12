import reader from "g-sheets-api";
import L from "leaflet";
import { point, featureCollection, bbox } from "turf";
import voronoi from "@turf/voronoi";
import collect from "@turf/collect";

import "./../node_modules/leaflet/dist/leaflet.css";

document.addEventListener("DOMContentLoaded", function (event) {
  console.log("dom loaded");

  initializeMap();

  document.getElementById("button-load").onclick = () => {
    readSheet();
  };
  document.getElementById("column-x").onchange = () => {
    populateMap();
  };
  document.getElementById("column-y").onchange = () => {
    populateMap();
  };
  document.getElementById("column-region").onchange = () => {
    populateMap();
  };
  document.getElementById("column-name").onchange = () => {
    populateMap();
  };
});

var records = [];

const readSheet = () => {
  document.getElementById("message").innerHTML = "loading";
  reader(
    {
      apiKey: document.getElementById("input-apikey").value,
      returnAllResults: true,
      sheetId: document.getElementById("input-spreadsheet").value,
      sheetName: document.getElementById("input-sheet").value,
    },
    (results) => {
      document.getElementById("message").innerHTML = "";
      records = results;

      prepareColumns();
      populateMap();
    },
    (err) => {
      console.log(err);
      document.getElementById("message").innerHTML = err;
      records = [];
    }
  );
};

// add options to column selects
const prepareColumns = () => {
  const selectX = document.getElementById("column-x");
  const selectY = document.getElementById("column-y");
  const selectRegion = document.getElementById("column-region");
  const selectName = document.getElementById("column-name");

  selectX.innerHTML = "";
  selectY.innerHTML = "";
  selectRegion.innerHTML = "";
  selectName.innerHTML = "";

  Object.keys(records[0]).forEach((columnName) => {
    selectX.innerHTML += `<option value=${columnName} ${
      columnName === "x" ? "selected" : ""
    }>${columnName}</option>`;
    selectY.innerHTML += `<option value=${columnName} ${
      columnName === "y" ? "selected" : ""
    }>${columnName}</option>`;
    selectRegion.innerHTML += `<option value=${columnName} ${
      columnName === "region" ? "selected" : ""
    }>${columnName}</option>`;
    selectName.innerHTML += `<option value=${columnName} ${
      columnName === "name" ? "selected" : ""
    }>${columnName}</option>`;
  });
};

var map;
var pointLayer;
var polygonLayer;

const initializeMap = () => {
  map = L.map("map", {
    center: [51.505, -0.09],
    zoom: 13,
  });

  const polygonsPane = map.createPane("polygons");
  const pointsPane = map.createPane("points");

  polygonLayer = L.layerGroup({ pane: "polygons" });
  polygonLayer.options.pane = "polygons";
  polygonLayer.addTo(map);

  pointLayer = L.layerGroup({ pane: pointsPane }).addTo(map);

  var OpenStreetMap_Mapnik = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }
  );

  OpenStreetMap_Mapnik.addTo(map);
};

const populateMap = () => {
  const columnX = document.getElementById("column-x").value;
  const columnY = document.getElementById("column-y").value;
  const columnRegion = document.getElementById("column-region").value;
  const columnName = document.getElementById("column-name").value;

  const validRecordPoints = records.filter(
    (r) => parseFloat(r[columnX]) && parseFloat(r[columnY])
  );

  const pointFeatures = validRecordPoints.map((p, pi) => {
    const x = parseFloat(p[columnX]);
    const y = parseFloat(p[columnY]);
    return point([x, y], { ...p, ...{ _id: pi } });
  });

  if (validRecordPoints.length > 0) {
    // clean map
    pointLayer.clearLayers();
    polygonLayer.clearLayers();

    const pointsBbox = L.latLngBounds(
      pointFeatures.map((p) => L.latLng(p.geometry.coordinates))
    );

    const pointCollection = featureCollection(pointFeatures);

    const paddedBbox = pointsBbox.pad(0.1);

    const voronoiPolygons = voronoi(pointCollection, {
      bbox: [
        paddedBbox.getSouth(),
        paddedBbox.getWest(),
        paddedBbox.getNorth(),
        paddedBbox.getEast(),
      ],
    });

    const polygonFeatures = collect(
      voronoiPolygons,
      pointCollection,
      "_id",
      "_id"
    ).features.filter((p) => p.properties._id.length > 0);

    polygonFeatures.forEach((polygon) => {
      const polygonId = polygon.properties._id[0];
      const relevantPoint = pointFeatures.find(
        (point) => point.properties._id === polygonId
      );
      if (relevantPoint) {
        polygon.properties = { ...relevantPoint.properties };
      }
    });

    // assign colors to regions
    const regions = [];
    pointFeatures.forEach((point) => {
      const pointRegion = point.properties[columnRegion];
      const alreadyAdded = regions.find((r) => r.id === pointRegion);

      if (!alreadyAdded) {
        const regionsListLength = regions.length;
        const thisColor = colors[regionsListLength % colors.length];
        regions.push({
          id: pointRegion,
          color: thisColor,
        });
      }
    });

    // create legend
    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    regions.forEach((region) => {
      legend.innerHTML += `
        <p class="legend-line">
          <span class="rectangle-color" style="background-color: ${region.color}" ></span>
          <span class="label">${region.id}</span>
        </p>
      `;
    });

    pointFeatures.forEach((feat) => {
      const marker = new L.CircleMarker(feat.geometry.coordinates, {
        radius: 2,
        fillColor: "black",
        color: "white",
        weight: 1,
        pane: "points",
      });
      pointLayer.addLayer(marker);
    });

    polygonFeatures.forEach((polygonFeature) => {
      const region = regions.find(
        (r) => r.id === polygonFeature.properties[columnRegion]
      );
      if (region) {
        const polygon = new L.Polygon(polygonFeature.geometry.coordinates, {
          color: "white",
          fillColor: region.color,
          fillOpacity: 1,
          weight: 1.5,
          pane: "polygons",
        }).bindTooltip(
          `<div>locality: ${polygonFeature.properties[columnName]}</div><br /><div>region: ${region.id}</div>`
        );
        polygonLayer.addLayer(polygon);
      }
    });

    if (pointsBbox.isValid()) {
      map.fitBounds(pointsBbox);
    }

    document.getElementById(
      "message"
    ).innerHTML = `loaded ${pointFeatures.length} valid records`;
  } else {
    document.getElementById("message").innerHTML = `no valid records`;
  }
};

const colors = [
  "#a4c400",
  "#60a917",
  "#008a00",
  "#00aba9",
  "#1ba1e2",
  "#0050ef",
  "#6a00ff",
  "#aa00ff",
  "#f472d0",
  "#d80073",
  "#a20025",
  "#e51400",
  "#fa6800",
  "#f0a30a",
  "#e3c800",
  "#825a2c",
  "#6d8764",
  "#647687",
  "#76608a",
  "#a0522d",
];
