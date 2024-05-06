import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';

import { mergeOptions } from "./helper.js"

export  class ClusterMap {
  constructor(results, featureCollection, options={}) {
    this.results = results
    this.featureCollection = featureCollection
    this.zExtent = d3.extent(results, d => d.z)

    options = mergeOptions({
      width: 640, height: 480,
      style: { fontSize: "12px" }, 
      colorMode: "label",
      colors: {
        highlight: "orange",
        highHigh: "#ff3d47",
        highLow: "#f99ae4",
        lowHigh: "#94d1ff",
        lowLow: "#186ffb",
        notSignificant: "whitesmoke"
      },
      pointOpacity: 0.8,
      projection: {type: "identity", domain: featureCollection}
    }, options)

    Object.assign(this, options)

    if (this.projection == null) {
      this.projection = { type: "identity", domain: featureCollection }
    }


    this.colorMap = new Map([
      ["High-high", this.colors.highHigh],
      ["High-low", this.colors.highLow],
      ["Low-high", this.colors.lowHigh],
      ["Low-low", this.colors.lowLow],
      ["Not significant", this.colors.notSignificant]
    ])

    this.resultMap = d3.index(results, d => d.id)

    this.styleSheet = document.createElement("style")
    this.styleSheet.innerText = `
      .geo-path {
        cursor: pointer;
      }
    `
    
    this.plotContainer = document.createElement("div")
    this.plotContainer.appendChild(this.styleSheet)
  }

  plot() {
    const plot = Plot.plot({
      x: { axis: null}, y: { axis: null },
      projection: this.projection,
      width: this.width,
      height: this.height,
      marks: [
        Plot.geo(this.featureCollection, {
          fill: d => this.colorMap.get(this.resultMap.get(d.id)?.label),
          stroke: "lightgrey", strokeOpacity: .5,
        }),
      ]
    })

    this.geoPaths = d3.select(plot)
      .select("g[aria-label='geo']")
      .selectAll("path")
        .attr("class", "geo-path")

    this.geoPaths.on("mouseover", (e,i) => {
      const feature = this.featureCollection.features[i]
      const result = this.resultMap.get(feature.id)
      this.#focus(result.id, d3.select(e.target))
      if (this.hoverListener) this.hoverListener(result, e)
    })

    this.geoPaths.on("mouseleave", () => {
      if (this.hoverListener) this.hoverListener(null)
      this.#focus(null, d3.select())
    })

    this.plotContainer.innerHTML = ''
    this.plotContainer.appendChild(this.styleSheet)
    this.plotContainer.appendChild(plot)
    return this.plotContainer
  }

  focus(id) {
    const select = id ? this.geoPaths.filter(d => this.featureCollection.features[d]?.id == id) : d3.select()
    this.#focus(id, select)
  }

  #focus(id, elemSelect) {
    if (this.prevElemSelect) {
      this.prevElemSelect.attr("stroke", "lightgrey")
        .attr("stroke-width", 1)
    }
    
    elemSelect.attr("stroke", this.colors.highlight)
      .attr("stroke-width", 3)
    elemSelect.raise()
    this.prevElemSelect = elemSelect
  }

  onHover(listener) {
    this.hoverListener = listener
  }
}
