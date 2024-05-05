import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import { MoranNetwork } from './MoranNetwork.js';
import { MoranDualDensity } from './MoranDualDensity.js';
import { ClusterMap } from './ClusterMap.js';
import { addPopperTooltip } from './helper.js';
import { LagPolar } from './LagPolar.js';

import * as Popper from 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/+esm'


const COLORS = {
  highHigh:  "#ff3d47",
  highLow:  "#f99ae4",
  lowHigh: "#94d1ff",
  lowLow: "#186ffb",
  notSignificant: "#f0f0f0",
  notSignificantPoint:"#d1d1d1",
}

let elements = {} 
let areaNameMap = new Map()

async function loadData() {
  const features = await d3.json("data/us_counties.json")
  const results = await d3.json("data/moran_us_cancer_mortality-2011-2020_county.json")
  // TODO: Un-hardcode centroids (when we support data upload)
  const centroids = await d3.json("data/centroids.json")
  return {features, results, centroids}
}

function run(features, results, centroids) {
  elements = {
    networkContainer: document.querySelector("#network-container"),
    dualContainer: document.querySelector("#dual-container"),
    mapContainer: document.querySelector("#map-container"),
  }

  //  TODO: Un-hardcode to US
  areaNameMap = new Map(features.features.map(d => [d.id, d.properties.name + ", " + d.state.name]))

  const resizeObserver = new ResizeObserver(() => drawPlots(features, results, centroids))
  resizeObserver.observe(elements.mapContainer)
  
}

function drawPlots(features, results, centroids) {
  elements.networkContainer.innerHTML = ''
  elements.dualContainer.innerHTML = ''
  elements.mapContainer.innerHTML = ''

  const networkWidth = elements.networkContainer.getBoundingClientRect().width 

  // Moran dual density plot
  const moranDualPlot = new MoranDualDensity(results, {
    width: networkWidth, marginLeft: 20, marginRight: 20,
    textMode: "label_only", fontSize: 14,
    height: 150, centerHeight: 50,
    colors: COLORS,
    // TODO: Remove this temporary code
    // colors: {
    //   ...COLORS, positiveAutocorrelation: COLORS.highHigh, negativeAutocorrelation: COLORS.highLow
    // }
  })

  // Moran network scatterplot
  const moranNetworkPlot = new MoranNetwork(results, {
    width: networkWidth, height: networkWidth, 
    zExtent: moranDualPlot.zExtent, 
    drawAxisConnections: true,
    hideXAxis:  true, marginBottom: 10,
    colors: {...COLORS, notSignificant: COLORS.notSignificantPoint},
  })

  console.log(elements.mapContainer.getBoundingClientRect())
  
  // Cluster map
  const clusterMap = new ClusterMap(results, features, { 
    width: elements.mapContainer.getBoundingClientRect().width,
    height: elements.mapContainer.getBoundingClientRect().height,
    colors: {...COLORS, notSignificant: "whitesmoke"},
    projection: {type: "albers-usa", domain: features}
  })

  moranNetworkPlot.onHover((d,i) => {
    moranDualPlot.focus(d?.id)
    clusterMap.focus(d?.id)
  })


  requestAnimationFrame(() => {
    addMapTooltip({clusterMap, moranDualPlot, moranNetworkPlot}, centroids, results)
  })
  
  elements.networkContainer.appendChild(moranNetworkPlot.plot())
  elements.dualContainer.appendChild(moranDualPlot.plot())
  elements.mapContainer.appendChild(clusterMap.plot())
}

function addMapTooltip(plots, centroids, results) {
  // const centroids = []
  // d3.select(elements.mapContainer).selectAll("path")
  //   .each((_,i,paths) => {
  //     const bbox = paths[i].getBBox()
  //     centroids.push({id: features.features[i].id, centroid: [bbox.x + bbox.width/2, bbox.y + bbox.height/2]})
  //   })

  const tooltipElem = document.createElement("div")
  tooltipElem.classList.add("tooltip")
  const tooltip = addPopperTooltip(elements.mapContainer)
  const tooltipText = document.createElement("b")
  tooltipElem.appendChild( tooltipText)

  const centroidIds = new Set(centroids.map(d => d.id))
  const lagPolarPlot = new LagPolar(results.filter(d => centroidIds.has(d.id)), {
    size: 120, zExtent: plots.moranDualPlot.zExtent, featureCentroids: centroids, pointRadius: 2.5,
  })
  tooltipElem.appendChild(lagPolarPlot.plot())

  plots.clusterMap.onHover((result,e) => {
    lagPolarPlot.focus(result?.id)
    plots.moranNetworkPlot.focus(result?.id)
    plots.moranDualPlot.focus(result?.id)
    
    if (result) {
      tooltipText.innerText = areaNameMap.get(result.id)
      tooltip.show(e.target, tooltipElem)
    } else {
       tooltip.hide()
    }
  })

  return tooltip
}

loadData().then(({features, results, centroids}) => run(features, results, centroids))
