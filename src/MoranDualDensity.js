import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';

import { calcMargins, estimateDistribution, mergeOptions, interpolatePoints } from "./helper.js"
import { Result, ResultCutoff, ResultDistribution } from "./types.js"

export class MoranDualDensity {
  constructor(results, options={}) {
    options = mergeOptions({
      width: 480, 
      height: 160,
      margin: 30,
      centerHeight: 50,
      
      textMode: "label_only",
      fontSize: 12,
      
      zDistribution: "auto", 
      lagDistribution: "auto", 
      lagDistributionDisplay: "stroke", // or "fill" or "stroke"

      labelAreas: true,

      areaMode: "cluster_labels", // or "positive_negative" or "hot_cold"
      
      colors: {
        font: "grey",
        distribution: "#E5E4E2",
        z: "black",
        neighbors: "black",
        connection: "blue",
        positiveAutocorrelation: "green",
        negativeAutocorrelation: "purple",
        highHigh: "#ff3d47",
        highLow: "#f99ae4",
        lowHigh: "#94d1ff",
        lowLow: "#186ffb",
        outlier: "purple"
      },
    }, options)

    Object.assign(options, calcMargins(options))
    Object.assign(this, options)

    this.resultIndex = d3.index(results, d => d.id)
    if (this.zDistribution === "auto") {
      this.zDistribution = estimateDistribution(results.map(d => d.z))
    } 
    this.zExtent = d3.extent(this.zDistribution, d => d[0])
    if (this.lagDistribution === "auto") {
      this.lagDistribution = estimateDistribution(results.map(d => d.lag))
    }

    // Text labelling
    this.text = { z: d => "", lag: d => "", statistic: d => ""}
    if (this.textMode == "verbose") {
      this.text.lag = result => "lag = " + result.lag.toFixed(3) 
      this.text.statistic = result => "Ii = " + result.statistic.toFixed(3) 
      this.text.z = result => "z = " + result.z.toFixed(3) 
    } else if (this.textMode == "label_only") {
      this.text.lag = result => "lag"
      this.text.statistic = result => "Ii"
      this.text.z = result => "z"
    }

    this.focalId = null

    this.plotContainer = document.createElement("div")
    this.plotContainer.style.display = "flex" 
    this.plotContainer.style.flexDirection = "column"
    this.plotContainer.style.width = this.width + "px"
    this.plotContainer.style.height = this.height + "px"
  }

  plot() {
    this.focus(this.focalId)
    return this.plotContainer 
  }

  focus(id) {
    this.#focus(id)
  }

  #focus(id) {
    this.focalId = id 

    this.plotContainer.innerHTML = ''
    const result = this.resultIndex.get(this.focalId)
    
    if (Result.safeParse(result).success) {
      const moranDistribution = this.zDistribution.map(d => [d[0] * result.z, d[1]])
      const moranExtent = d3.extent(moranDistribution, d => d[0])
      if (result.z < 0) moranExtent.reverse()
      const scaleMap = d3.scaleLinear(moranExtent, this.zExtent)

      if (this.areaMode == "positive_negative") {
        this.positiveColor = this.colors.positiveAutocorrelation
        this.negativeColor = this.colors.negativeAutocorrelation
        this.positiveLabel = "Positive"
        this.negativeLabel = "Negative"
      } else if (this.areaMode == "hot_cold") {
        this.positiveColor = result.z > 0 ? this.colors.highHigh : this.colors.lowLow
        this.negativeColor = this.colors.outlier
        this.positiveLabel = result.z > 0 ? "Hot-spot" : "Cold-spot"
        this.negativeLabel = "Outlier"
      } else {
        this.positiveColor = result.z > 0 ? this.colors.highHigh : this.colors.lowLow
        this.negativeColor = result.z > 0 ? this.colors.highLow : this.colors.lowHigh
        this.positiveLabel = result.z > 0 ? "High-high" : "Low-low"
        this.negativeLabel = result.z > 0 ? "High-low" : "Low-high"
      }
      
      this.plotContainer.appendChild(this.#valueDensityPlot(result))
      this.plotContainer.appendChild(this.#centerLinkPlot(result, scaleMap))
      this.plotContainer.appendChild(this.#moranDensityPlot(result, scaleMap))
    } else {
       this.plotContainer.appendChild(this.#valueDensityPlot(result))
    }
  }

  #valueDensityPlot(result) {

    let allY = this.zDistribution
    if (this.lagDistribution) {
      allY = allY.concat(this.lagDistribution)
    }
    const yMax = d3.max(allY, d => d[1])
    const pointY = .4

    // TODO: Dim the axis labels when the z marker overlaps
    const marks = [
      Plot.text(["Value (z) →"], {
        frameAnchor: "top-right", dx: this.marginRight, 
      }),
      Plot.areaY(this.zDistribution, {
        x: d => d[0], y: d => d[1], fill: this.colors.distribution, curve: "basis", opacity: .5, 
      }),
      
    ] 

    if (this.lagDistribution) {
      marks.push(Plot.text(["Spatial lag →"], {
        frameAnchor: "top-right", dx: this.marginRight, dy: this.fontSize, fill: this.colors.connection
      }))
      if (this.lagDistributionDisplay == "fill") {
        marks.push(Plot.areaY(this.lagDistribution, {
          x: d => d[0], y: d => d[1], fill: this.colors.connection, opacity: .08, mixBlendMode: "multiply"
        }))
      } else if (this.lagDistributionDisplay == "stroke") {
        marks.push(Plot.lineY(this.lagDistribution, {
          x: d => d[0], y: d => d[1], stroke: this.colors.connection, opacity: .3, mixBlendMode: "multiply",
          strokeDasharray: "3,3"
        }))
      }

 
    }

    if (Result.safeParse(result).success) {
      const neighborResults = result.neighborWeights.map(([id,w]) => this.resultIndex.get(id)).filter(d => d)
      const dx = result.z > 0 ? 4 : -4
      const textAnchor = result.z > 0 ? "start" : "end"

      marks.push.apply(marks,  [
        Plot.link(neighborResults, {
          x1: d => d.z, y1: yMax*pointY,
          x2: result.lag, y2: 0,
          stroke: "black", strokeDasharray: "1,3", strokeOpacity: .4, curve: "bump-y"
        }),
        Plot.dot(neighborResults, { 
          y: yMax*pointY, x: d => d.z, 
          fill: "black", opacity: .7, r: 2
        }),

        Plot.arrow([result], {
          x1: 0, y1: yMax, y2: yMax, x2: "z", stroke: this.colors.z, dy: 3, insetEnd: 5, 
          strokeDasharray: "2,2",
          strokeWidth: 1.2, headLength: 8
        }),
        Plot.dot([result], {
          y: yMax, x: "z", fill: this.colors.z, dy: 3
        }),
        Plot.text([result], {
          x: d => d.z, y: yMax, fill: this.colors.z, 
          text: this.text.z,
          textAnchor,  dx, dy: 8
        }),
        
      ])   
    }

    marks.push(Plot.ruleX([0], {strokeOpacity: .3, strokeWidth: .5}))

    return Plot.plot({
      style: {fontSize: this.fontSize, color: this.colors.font},
      
      width: this.width,
      height: (this.height - this.centerHeight)/2,
      marginLeft: this.marginLeft, 
      marginRight: this.marginRight, 
      marginTop: this.marginTop,

      //y: { domain: yDomain},
      y: { axis: null, reverse: false },
      x: { domain: this.zExtent, axis: null },
      
      marks
    })
  }

  #centerLinkPlot(result, scaleMap) {
    // Automatically position label to avoid  cut-off boundaries
    const leftLabel = result.lag > 0 && result.label == "Not significant" || 
      result.lag < 0 && result.label != "Not significant"
    const labelTextAnchor = leftLabel ? "end" : "start"
    const labelDx = leftLabel ? -6 : 6

    const marks = [
      Plot.ruleX([result], Plot.mapX((D) => D.map(scaleMap), {
        x: d => d.statistic, stroke: this.colors.connection, strokeDasharray: "2,2"
      })),
      Plot.dot([result], Plot.mapX((D) => D.map(scaleMap), {
        x: d => d.statistic, y: 1, fill: this.colors.connection, dy: -3
      })),
      Plot.dot([result], Plot.mapX((D) => D.map(scaleMap), {
        x: d => d.statistic, y: -1, fill: this.colors.connection, dy: 3
      })),

      Plot.text([result], {
        x: d => d.lag, fill: this.colors.connection, 
        text: this.text.lag,
        textAnchor: labelTextAnchor, frameAnchor: "top", dx: labelDx, dy: 8
      }),
      Plot.text([result], {
        x: d => d.lag, fill: this.colors.connection, 
        text: this.text.statistic,
        textAnchor: labelTextAnchor, frameAnchor: "bottom", dx: labelDx, dy: -8
      }),
    ]

    if (ResultCutoff.safeParse(result).success) {
    
      marks.push.apply(marks, [
         Plot.rect([result], Plot.mapX((D) => D.map(scaleMap), {
          y1: -1, y2: 1, x1: d => d.upperCutoff, x2: d3.max(scaleMap.domain()), 
          fill: this.positiveColor, fillOpacity: .1
        })),
        Plot.rect([result], Plot.mapX((D) => D.map(scaleMap), {
          y1: -1, y2: 1, x1: d => d.lowerCutoff, x2: d3.min(scaleMap.domain()), 
          fill: this.negativeColor, fillOpacity: .1
        })),

        Plot.ruleX([result], Plot.mapX((D) => D.map(scaleMap), {
          x: d => d.upperCutoff, stroke: this.positiveColor, strokeDasharray: "3,3"})),
        Plot.ruleX([result], Plot.mapX((D) => D.map(scaleMap), {
          x: d => d.lowerCutoff, stroke: this.negativeColor, strokeDasharray: "3,3"})),
      ])

      if (this.labelAreas) {
        marks.push.apply(marks, [
          Plot.text([result], { text: d => d.z > 0 ? this.positiveLabel : this.negativeLabel, 
            fill: d => d.z > 0 ? this.positiveColor : this.negativeColor, 
            frameAnchor: "right", textAnchor: "end", dx: -10, opacity: .8}),
          Plot.text([result], { text: d => d.z <= 0 ? this.positiveLabel : this.negativeLabel, 
              fill: d => d.z <= 0 ? this.positiveColor : this.negativeColor, 
              frameAnchor: "left", textAnchor: "start", dx: 10, opacity: .8}),
       ])
      }
      
    }

    marks.push.apply(marks, [
      Plot.text([this.zExtent[0].toFixed(2), 0, this.zExtent[1].toFixed(2)], {
        x: d => d, frameAnchor: "top", dy: 3, opacity: .8}),
      Plot.text([scaleMap.domain()[0].toFixed(2), 0, scaleMap.domain()[1].toFixed(2)],  Plot.mapX((D) => D.map(scaleMap), {
        x: d => d, frameAnchor: "bottom", dy: -3, opacity: .8})),
      Plot.ruleX([0], {strokeOpacity: .3, strokeWidth: .5})
    ])
    
    return Plot.plot({
      style: {fontSize: this.fontSize, color: this.colors.font},
      
      width: this.width, 
      height: this.centerHeight,
      marginLeft: this.marginLeft, 
      marginRight: this.marginRight, 
      marginTop: 0,

      x: { axis: "top", grid: false, domain: this.zExtent, tickSize: 0, label: "Value (z)", axis: null},
      y: { axis: null, domain: [1, -1]},

      marks
    })
  }

  #moranDensityPlot(result, scaleMap) {
    const axisLabel = result.z < 0 ? "← Local Moran's I" : "Local Moran's I →"

    const marks = [
      Plot.text([axisLabel], {frameAnchor: "bottom-right", dx: this.marginInline}),
    ]

    if (ResultDistribution.safeParse(result).success) {
      const permutationDistribution = interpolatePoints(result.permutationDistribution, [result.lowerCutoff, result.upperCutoff]);

      [
        Plot.areaY(permutationDistribution, Plot.mapX((D) => D.map(scaleMap), {
            x: d => d[0], y: d => d[1], fill: this.colors.distribution, curve: "basis"})),
        Plot.areaY(permutationDistribution.filter(d => d[0] <= result.lowerCutoff), Plot.mapX((D) => D.map(scaleMap), {
          x: d => d[0], y: d => d[1], fill: this.negativeColor, curve: "basis", opacity: .7})),
        Plot.areaY(permutationDistribution.filter(d => d[0] >= result.upperCutoff), Plot.mapX((D) => D.map(scaleMap), {
          x: d => d[0], y: d => d[1], fill: this.positiveColor, curve: "basis", opacity: .7})),
  
        Plot.ruleX([0], {strokeOpacity: .3, strokeWidth: .5})
      ].forEach(d => marks.push(d))
    }

    
    return Plot.plot({
      style: {fontSize: this.fontSize, color: this.colors.font},
      
      width: this.width,
      height: (this.height - this.centerHeight)/2,
      marginLeft: this.marginLeft, 
      marginRight: this.marginRight, 
      marginBottom: this.marginBottom,
       
      y: { axis: null, reverse: true },
      x: { domain: this.zExtent, axis: null },

      marks
    })
  }
}