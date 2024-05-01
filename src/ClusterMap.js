import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';

import { mergeOptions } from "./helper.js"

export class ClusterMap {
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
        highHigh: "red",
        highLow: "pink",
        lowHigh: "lightblue",
        lowLow: "blue",
        notSignificant: "whitesmoke"
      },
      pointOpacity: 0.8,
      hoverListener: d => d,
      plotOptions: {
        x: { axis: null}, y: { axis: null },
      }
    }, options)

    Object.assign(this, options)

    this.colorMap = new Map([
      ["High-high", this.colors.highHigh],
      ["High-low", this.colors.highLow],
      ["Low-high", this.colors.lowHigh],
      ["Low-low", this.colors.lowLow],
      ["Not significant", this.colors.notSignificant]
    ])

    this.resultMap = d3.index(results, d => d.id)
    if (!this.plotOptions.color) {
      this.setColorMode(this.colorMode)
    }

    this.styleSheet = document.createElement("style")
    this.styleSheet.innerText = `
      .geo-path {
        cursor: pointer;
      }
    `
    
    this.plotContainer = document.createElement("div")
    this.plotContainer.appendChild(this.styleSheet)
  }

  setColorMode(mode) {
    this.mode = mode 

    if (mode == "value") {
      this.plotOptions.color = {
        scheme: "PRGn", pivot: d3.mean(results, d => d.value), legend: true
      }
    }
  }

  plot() {
    let plot = null
    if (this.colorMode == "value") {
      plot = Plot.plot({
        ...this.plotOptions, 
        marks: [
          Plot.geo(this.featureCollection, {
            fill: d => this.resultMap.get(d.id)?.value,
          }),
          Plot.geo(this.featureCollection, {
            stroke: d => this.colorMap.get(this.resultMap.get(d.id)?.label),
            strokeWidth: 1,
          })
        ]
      })
    } else if (this.colorMode == "label") {
      plot = Plot.plot({
        ...this.plotOptions, 
        width: this.width,
        marks: [
          Plot.geo(this.featureCollection, {
            fill: d => this.colorMap.get(this.resultMap.get(d.id)?.label),
            stroke: "lightgrey", strokeOpacity: .5,
          }),
        ]
      })
    }

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
      this.hoverListener(null)
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