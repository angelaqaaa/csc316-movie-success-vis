
/*
 * Timeline - ES6 Class
 * @param  parentElement 	-- the HTML element in which to draw the visualization
 * @param  data             -- the movie data to visualize
 * @param  onBrush          -- callback function when brush changes
 */

class Timeline {

    // constructor method to initialize Timeline object
    constructor(parentElement, data, onBrush) {
        this.parentElement = parentElement;
        this.data = data;
        this.onBrush = onBrush; // Callback function to notify parent
        this.displayData = [];

        this.initVis();
    }

    // create initVis method for Timeline class
    initVis() {
        let vis = this;

        vis.margin = { top: 20, right: 40, bottom: 25, left: 60 };

        // Get the actual width of the container
        let container = document.getElementById(vis.parentElement);
        let containerWidth = container ? container.getBoundingClientRect().width : 1400;

        // Use the full container width minus margins
        vis.width = containerWidth - vis.margin.left - vis.margin.right;
        vis.height = 120 - vis.margin.top - vis.margin.bottom;

        // SVG drawing area
        vis.svg = d3.select("#" + vis.parentElement)
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            .append("g")
            .attr("transform", `translate(${vis.margin.left}, ${vis.margin.top})`);

        // Scales
        vis.xScale = d3.scaleLinear()
            .range([0, vis.width]);

        vis.yScale = d3.scaleLinear()
            .range([vis.height, 0]);

        // Axes
        vis.xAxis = d3.axisBottom(vis.xScale)
            .tickFormat(d3.format("d"))
            .ticks(10); // Limit number of ticks for better readability

        vis.yAxis = d3.axisLeft(vis.yScale)
            .tickFormat(d => `$${(d / 1000000).toFixed(0)}M`)
            .ticks(5);

        vis.xAxisGroup = vis.svg.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", `translate(0, ${vis.height})`);

        vis.yAxisGroup = vis.svg.append("g")
            .attr("class", "axis y-axis");

        // Add axis labels
        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", vis.width / 2)
            .attr("y", vis.height + vis.margin.bottom + 10)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Year");



        // Add title
        vis.svg.append("text")
            .attr("class", "slider-title")
            .attr("x", vis.width / 2)
            .attr("y", -5)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Average Movie Revenue by Year");

        // Initialize brush component
        vis.brush = d3.brushX()
            .extent([[0, 0], [vis.width, vis.height]])
            .on("brush end", function (event) {
                if (event.selection) {
                    // Convert pixel coordinates to year values
                    let yearRange = event.selection.map(vis.xScale.invert);
                    // Call the callback function with selected range
                    if (vis.onBrush) {
                        vis.onBrush(yearRange);
                    }
                } else {
                    // No selection - reset to null
                    if (vis.onBrush) {
                        vis.onBrush(null);
                    }
                }
            });

        // Append brush component
        vis.brushGroup = vis.svg.append("g")
            .attr("class", "brush");

        // Add double-click to reset brush selection
        vis.svg.on("dblclick", function() {
            vis.brushGroup.call(vis.brush.move, null);
            if (vis.onBrush) {
                vis.onBrush(null);
            }
        });

        // Initial data processing
        vis.wrangleData();

        // Add window resize listener
        window.addEventListener('resize', function () {
            vis.handleResize();
        });
    }

    handleResize() {
        let vis = this;

        // Recalculate dimensions
        let container = document.getElementById(vis.parentElement);
        if (container) {
            let containerWidth = container.getBoundingClientRect().width;

            vis.width = containerWidth - vis.margin.left - vis.margin.right;

            // Update SVG dimensions
            vis.svg
                .attr("width", vis.width + vis.margin.left + vis.margin.right)
                .attr("height", vis.height + vis.margin.top + vis.margin.bottom);

            // Update scales
            vis.xScale.range([0, vis.width]);
            vis.yScale.range([vis.height, 0]);

            // Update brush extent
            vis.brush.extent([[0, 0], [vis.width, vis.height]]);

            // Redraw
            vis.updateVis();
        }
    }

    wrangleData() {
        let vis = this;

        // Filter out invalid data first
        let validData = vis.data.filter(d =>
            d.Gross > 0 &&
            !isNaN(d.Released_Year) &&
            !isNaN(d.Gross) &&
            d.Released_Year > 1900 &&
            d.Released_Year < 2030
        );

        // Calculate average gross revenue per year
        let yearData = d3.rollup(
            validData,
            v => d3.mean(v, d => d.Gross),
            d => d.Released_Year
        );

        vis.displayData = Array.from(yearData, ([year, avgGross]) => ({
            year: year,
            avgGross: avgGross || 0
        }))
            .filter(d => !isNaN(d.avgGross) && d.avgGross > 0)
            .sort((a, b) => a.year - b.year);

        console.log(`Timeline data points: ${vis.displayData.length}`);
        vis.updateVis();
    }

    updateVis() {
        let vis = this;

        if (vis.displayData.length === 0) {
            console.warn("No data to display in timeline");
            return;
        }

        // Update scales - add padding to show full year range
        let minYear = d3.min(vis.displayData, d => d.year);
        let maxYear = d3.max(vis.displayData, d => d.year);

        vis.xScale.domain([minYear - 1, maxYear + 1]);

        vis.yScale.domain([
            0,
            d3.max(vis.displayData, d => d.avgGross) * 1.1
        ]);

        console.log(`Timeline year range: ${minYear} - ${maxYear}`);

        // Update axes
        vis.xAxisGroup.call(vis.xAxis);
        vis.yAxisGroup.call(vis.yAxis);

        // Draw trend line
        let line = d3.line()
            .x(d => vis.xScale(d.year))
            .y(d => vis.yScale(d.avgGross))
            .curve(d3.curveMonotoneX);

        vis.svg.selectAll(".trend-line")
            .data([vis.displayData])
            .join("path")
            .attr("class", "trend-line")
            .attr("d", line);

        // Apply brush
        vis.brushGroup.call(vis.brush);
    }
}