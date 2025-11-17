
/*
 * Timeline - ES6 Class
 * @param  parentElement 	-- the HTML element in which to draw the visualization
 * @param  data             -- the movie data to visualize
 * @param  onBrush          -- callback function when brush changes
 */

class Timeline {

    // constructor method to initialize Timeline object
    constructor(parentElement, data, onBrush, onYearHover) {
        this.parentElement = parentElement;
        this.data = data;
        this.onBrush = onBrush; // Callback function to notify parent
        this.onYearHover = onYearHover; // Callback for year hover events
        this.displayData = [];
        this.hoveredYear = null; // Track currently hovered year
        this.animationFrame = null; // For throttling

        // Lock state management for click-to-lock feature
        this.lockedYear = null; // Currently locked year (null if not locked)
        this.graceTimer = null; // Timer for 700ms grace period
        this.isLocked = false; // Lock state flag

        // Track story mode state (prevents brush from being re-applied)
        this.isStoryModeActive = false;

        this.initVis();
    }

    // create initVis method for Timeline class
    initVis() {
        let vis = this;

        vis.margin = { top: 20, right: 35, bottom: 15, left: 65 };

        // Get the actual width of the container
        let container = document.getElementById(vis.parentElement);
        let containerWidth = container ? container.getBoundingClientRect().width : 1400;

        // Use the full container width minus margins
        vis.width = containerWidth - vis.margin.left - vis.margin.right;
        vis.height = 120 - vis.margin.top - vis.margin.bottom;

        // SVG drawing area
        let svgElement = d3.select("#" + vis.parentElement)
            .attr("width", vis.width + vis.margin.left + vis.margin.right)
            .attr("height", vis.height + vis.margin.top + vis.margin.bottom)
            // Removed tabindex to exclude from tab navigation as requested
            .attr("role", "slider") // Semantic role
            .attr("aria-label", "Timeline year selector");

        vis.svg = svgElement.append("g")
            .attr("transform", `translate(${vis.margin.left + 5}, ${vis.margin.top})`);

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
            .attr("class", "axis y-axis")

        // Add axis labels
        // X-axis label
        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("x", vis.width / 2)
            .attr("y", vis.height + vis.margin.bottom + 20)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Year");

        // Y-axis label
        vis.svg.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -vis.height / 2)
            .attr("y", -vis.margin.left + 8)
            .style("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Avg Revenue");

        // Add title
        vis.svg.append("text")
            .attr("class", "slider-title")
            .attr("x", vis.width / 2)
            .attr("y", 5)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "500")
            .style("fill", "#cccccc")
            .text("Average Movie Revenue by Year");

        // ===== Bidirectional Highlight: Timeline → Scatter =====
        // Create hairline group for year hover indicator (BEFORE brush so brush is on top)
        vis.hairlineGroup = vis.svg.append("g")
            .attr("class", "timeline-hairline")
            .style("pointer-events", "none")
            .style("opacity", 0);

        vis.hairline = vis.hairlineGroup.append("line")
            .attr("class", "dotted-line")
            .attr("y1", vis.height)
            .attr("y2", 10)
            .attr("stroke", "#e50914")
            .attr("stroke-width", 1)
            .attr("stroke-opacity", 1)
            .attr("stroke-dasharray", "3,3");

        // Add background rectangle for year label (for better readability)
        vis.hairlineLabelBg = vis.hairlineGroup.append("rect")
            .attr("y", -8)
            .attr("height", 16)
            .attr("rx", 3)
            .attr("fill", "rgba(0, 0, 0, 0.85)")
            .attr("stroke", "#e50914")
            .attr("stroke-width", 1);

        vis.hairlineLabel = vis.hairlineGroup.append("text")
            .attr("y", 5)
            .attr("text-anchor", "middle")
            .attr("fill", "#e50914")
            .attr("font-size", "11px")
            .attr("font-weight", "600");

        // Add lock icon (hidden by default, shown when locked)
        vis.lockIcon = vis.hairlineGroup.append("text")
            .attr("class", "lock-icon")
            .attr("y", 5)
            .attr("x", 25) // Position to the right of year label
            .attr("text-anchor", "start")
            .attr("fill", "#e50914")
            .attr("font-size", "10px")
            .style("opacity", 0)
            .style("pointer-events", "none")
            .text("🔒");

        // Add clear button (hidden by default, shown when locked)
        vis.clearButton = vis.hairlineGroup.append("g")
            .attr("class", "clear-button")
            .style("opacity", 0)
            .style("cursor", "pointer")
            .on("click", function(event) {
                event.stopPropagation(); // Prevent triggering timeline click
                vis.clearLock();
            });

        // Clear button background circle
        vis.clearButton.append("circle")
            .attr("cx", 45)
            .attr("cy", 1)
            .attr("r", 8)
            .attr("fill", "rgba(229, 9, 20, 0.2)")
            .attr("stroke", "#e50914")
            .attr("stroke-width", 1);

        // Clear button X text
        vis.clearButton.append("text")
            .attr("x", 45)
            .attr("y", 5)
            .attr("text-anchor", "middle")
            .attr("fill", "#e50914")
            .attr("font-size", "12px")
            .attr("font-weight", "700")
            .style("pointer-events", "none")
            .text("×");

        // Add hover tracking - attach to SVG to avoid blocking brush
        // The hairline will appear but brush interactions will still work
        vis.svg
            .on("mousemove.highlight", function(event) {
                // Cancel grace timer if mouse re-enters timeline
                if (vis.graceTimer) {
                    clearTimeout(vis.graceTimer);
                    vis.graceTimer = null;
                }

                // Disable hover when locked (simpler mental model)
                if (vis.isLocked) return;

                // Throttle with requestAnimationFrame
                if (vis.animationFrame) return;

                vis.animationFrame = requestAnimationFrame(() => {
                    const [mouseX] = d3.pointer(event, this);
                    let hoveredYear = Math.round(vis.xScale.invert(mouseX));

                    // Clamp year to scale domain to prevent showing years outside axis range
                    const [minDomain, maxDomain] = vis.xScale.domain();
                    hoveredYear = Math.max(minDomain, Math.min(maxDomain, hoveredYear));

                    // Update hairline position and bring to front
                    const xPos = vis.xScale(hoveredYear);
                    vis.hairlineGroup
                        .attr("transform", `translate(${xPos}, 0)`)
                        .style("opacity", 1)
                        .raise(); // Bring hairline to top so it's not covered by trend line

                    // Ensure hairline stroke is visible (fix for post-story mode)
                    vis.hairline
                        .attr("stroke", "#e50914")
                        .attr("stroke-opacity", 1);

                    vis.hairlineLabel.text(hoveredYear);

                    // Update background rectangle dimensions based on text width
                    const labelBBox = vis.hairlineLabel.node().getBBox();
                    vis.hairlineLabelBg
                        .attr("x", -labelBBox.width / 2 - 4)
                        .attr("width", labelBBox.width + 8);

                    // Notify main chart
                    if (vis.onYearHover && vis.hoveredYear !== hoveredYear) {
                        vis.hoveredYear = hoveredYear;
                        vis.onYearHover(hoveredYear);
                    }

                    vis.animationFrame = null;
                });
            })
            .on("mouseleave.highlight", function() {
                // Clear animation frame if pending
                if (vis.animationFrame) {
                    cancelAnimationFrame(vis.animationFrame);
                    vis.animationFrame = null;
                }

                // If locked, don't clear (locked state persists)
                if (vis.isLocked) return;

                // Start 550ms grace period instead of immediate clear
                // This allows user to move cursor to scatter area
                vis.graceTimer = setTimeout(() => {
                    // Hide hairline
                    vis.hairlineGroup.style("opacity", 0);

                    // Clear hover state
                    vis.hoveredYear = null;
                    if (vis.onYearHover) {
                        vis.onYearHover(null);
                    }

                    vis.graceTimer = null;
                }, 550);
            })
            .on("click.lock", function(event) {
                // Disable click-to-lock during story mode (but hover still works)
                if (vis.isStoryModeActive) return;

                // Ignore click if brushing (avoid conflicts)
                const brushSelection = d3.brushSelection(vis.brushGroup.node());
                if (brushSelection) return;

                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(vis.xScale.invert(mouseX));

                // Clamp year to scale domain
                const [minDomain, maxDomain] = vis.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                // Toggle lock state
                if (vis.isLocked && vis.lockedYear === clickedYear) {
                    // Unlock: clicking the same year again
                    vis.clearLock();
                } else {
                    // Lock: new year or first lock
                    vis.lockYear(clickedYear);
                }
            })
            .on("dblclick.lock", function(event) {
                // Disable double-click-to-lock during story mode (but hover still works)
                if (vis.isStoryModeActive) return;

                // Double-click to lock works even when brush is active
                // This allows locking a year when brushed (since single click is used for brush)
                event.preventDefault(); // Prevent default double-click behavior

                const [mouseX] = d3.pointer(event, this);
                let clickedYear = Math.round(vis.xScale.invert(mouseX));

                // Clamp year to scale domain
                const [minDomain, maxDomain] = vis.xScale.domain();
                clickedYear = Math.max(minDomain, Math.min(maxDomain, clickedYear));

                // Toggle lock state
                if (vis.isLocked && vis.lockedYear === clickedYear) {
                    // Unlock: double-clicking the same year again
                    vis.clearLock();
                } else {
                    // Lock: new year or first lock
                    vis.lockYear(clickedYear);
                }
            });

        // Add keyboard navigation
        svgElement.on("keydown", function(event) {
            // Disable keyboard lock during story mode (but hover still works)
            if (vis.isStoryModeActive) return;

            // Get year range from data
            if (!vis.displayData || vis.displayData.length === 0) return;

            const minYear = d3.min(vis.displayData, d => d.year);
            const maxYear = d3.max(vis.displayData, d => d.year);

            let currentYear = vis.isLocked ? vis.lockedYear : vis.hoveredYear;

            // If no current year, start at middle of range
            if (!currentYear) {
                currentYear = Math.round((minYear + maxYear) / 2);
            }

            let handled = false;
            let newYear = currentYear;

            switch(event.key) {
                case "ArrowLeft":
                    // Move to previous year
                    newYear = Math.max(minYear, currentYear - 1);
                    handled = true;
                    break;

                case "ArrowRight":
                    // Move to next year
                    newYear = Math.min(maxYear, currentYear + 1);
                    handled = true;
                    break;

                case "Enter":
                case " ": // Space
                    // Toggle lock on current year
                    if (vis.isLocked) {
                        vis.clearLock();
                    } else if (currentYear) {
                        vis.lockYear(currentYear);
                    }
                    handled = true;
                    break;

                case "Escape":
                    // Clear lock
                    if (vis.isLocked) {
                        vis.clearLock();
                    }
                    handled = true;
                    break;
            }

            if (handled) {
                event.preventDefault();

                // Update year if arrow key was pressed
                if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && newYear !== currentYear) {
                    if (vis.isLocked) {
                        // Move lock to new year
                        vis.lockYear(newYear);
                    } else {
                        // Show hover preview at new year
                        const xPos = vis.xScale(newYear);
                        vis.hairlineGroup
                            .attr("transform", `translate(${xPos}, 0)`)
                            .style("opacity", 1)
                            .raise(); // Bring hairline to top so it's not covered by trend line

                        // Ensure hairline stroke is visible
                        vis.hairline
                            .attr("stroke", "#e50914")
                            .attr("stroke-opacity", 1);

                        vis.hairlineLabel.text(newYear);

                        // Update background rectangle dimensions based on text width
                        const labelBBox = vis.hairlineLabel.node().getBBox();
                        vis.hairlineLabelBg
                            .attr("x", -labelBBox.width / 2 - 4)
                            .attr("width", labelBBox.width + 8);

                        vis.hoveredYear = newYear;

                        // Notify chart
                        if (vis.onYearHover) {
                            vis.onYearHover(newYear);
                        }
                    }
                }
            }
        });

        // Initialize brush component (AFTER hover area so brush is on top and clickable)
        // Store the original brush Y offset (for shortened brush appearance)
        vis.brushYOffset = 10;

        vis.brush = d3.brushX()
            .extent([[0, vis.brushYOffset], [vis.width, vis.height]])
            .on("brush end", function (event) {
                if (event.selection) {
                    // Convert pixel coordinates to year values
                    let yearRange = event.selection.map(vis.xScale.invert);
                    // Round to nearest integer years for cleaner alignment
                    yearRange = [Math.floor(yearRange[0]), Math.ceil(yearRange[1])];
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

        // Double-click is used for lock/unlock (see .on("dblclick.lock") above)
        // Brush reset is handled by the "Reset Timeline" button

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

            // Update brush extent (preserve original Y offset for shortened brush)
            vis.brush.extent([[0, vis.brushYOffset], [vis.width, vis.height]]);

            // Update hairline height (both y1 and y2 need to match new height)
            if (vis.hairline) {
                vis.hairline
                    .attr("y1", vis.height)  // Bottom of timeline
                    .attr("y2", 10);          // Top of timeline (near title)
            }

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

        // Apply brush (skip if story mode is active to prevent re-enabling)
        if (!vis.isStoryModeActive) {
            vis.brushGroup.call(vis.brush);
        }
    }

    // Method to highlight a specific year (bidirectional highlight: scatter → timeline)
    highlightYearOnTimeline(year) {
        let vis = this;

        // Remove existing pulse marker
        vis.svg.selectAll(".year-pulse").remove();

        if (year === null) return;

        // Find the data point for this year on the timeline
        const dataPoint = vis.displayData.find(d => d.year === year);

        // If no data for this year, don't show pulse
        if (!dataPoint) return;

        // Position pulse at the actual data point on the trend line
        const xPos = vis.xScale(year);
        const yPos = vis.yScale(dataPoint.avgGross);

        // Add expanding circle marker at the data point (single animation, no auto-remove)
        vis.svg.append("circle")
            .attr("class", "year-pulse")
            .attr("cx", xPos)
            .attr("cy", yPos)
            .attr("r", 0)
            .attr("fill", "#e50914")
            .attr("fill-opacity", 0.3)
            .attr("stroke", "#e50914")
            .attr("stroke-width", 2)
            .style("pointer-events", "none")
            .transition()
            .duration(400)
            .ease(d3.easeCircleOut)
            .attr("r", 12)
            .attr("stroke-width", 2)
            .attr("fill-opacity", 0.2)
            .attr("opacity", 0.6);
            // No auto-remove - will be cleared by next highlightYearOnTimeline call or explicit null

        // Add a persistent dot at the data point (no fade)
        vis.svg.append("circle")
            .attr("class", "year-pulse")
            .attr("cx", xPos)
            .attr("cy", yPos)
            .attr("r", 0)
            .attr("fill", "#e50914")
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1.5)
            .style("pointer-events", "none")
            .transition()
            .duration(200)
            .attr("r", 4)
            .attr("opacity", 1);
            // No auto-remove - will persist until cleared

        // Add year label above the data point (no fade)
        vis.svg.append("text")
            .attr("class", "year-pulse")
            .attr("x", xPos)
            .attr("y", yPos - 20)
            .attr("text-anchor", "middle")
            .attr("fill", "#e50914")
            .attr("font-size", "11px")
            .attr("font-weight", "700")
            .style("pointer-events", "none")
            .attr("opacity", 0)
            .text(year)
            .transition()
            .duration(200)
            .attr("opacity", 1);
            // No auto-remove - will persist until cleared
    }

    // Lock a specific year (click-to-lock functionality)
    lockYear(year) {
        let vis = this;

        // Clear any pending grace timer
        if (vis.graceTimer) {
            clearTimeout(vis.graceTimer);
            vis.graceTimer = null;
        }

        // Update lock state
        vis.isLocked = true;
        vis.lockedYear = year;
        vis.hoveredYear = year;

        // Position hairline at locked year
        const xPos = vis.xScale(year);
        vis.hairlineGroup
            .attr("transform", `translate(${xPos}, 0)`)
            .style("opacity", 1)
            .raise(); // Bring hairline to top so it's not covered by trend line

        // Update hairline to solid stroke (locked state)
        vis.hairline
            .attr("stroke-dasharray", "none")
            .attr("stroke-width", 2);

        // Update label
        vis.hairlineLabel.text(year);

        // Update background rectangle dimensions based on text width
        const labelBBox = vis.hairlineLabel.node().getBBox();
        vis.hairlineLabelBg
            .attr("x", -labelBBox.width / 2 - 4)
            .attr("width", labelBBox.width + 8);

        // Show lock icon and clear button
        vis.lockIcon
            .transition()
            .duration(200)
            .style("opacity", 1);

        vis.clearButton
            .transition()
            .duration(200)
            .style("opacity", 1)
            .style("pointer-events", "all");

        // Notify main chart to highlight
        if (vis.onYearHover) {
            vis.onYearHover(year);
        }

        // Count movies in this year for announcement
        const movieCount = vis.data.filter(d => d.Released_Year === year).length;
        const filmText = movieCount === 1 ? 'film' : 'films';
        vis.announce(`Year ${year} highlighted, ${movieCount} ${filmText}`);

        console.log(`Locked year: ${year}`);
    }

    // Clear locked state
    clearLock() {
        let vis = this;

        // Update lock state
        vis.isLocked = false;
        vis.lockedYear = null;
        vis.hoveredYear = null;

        // Reset hairline to dashed stroke (hover state)
        vis.hairline
            .attr("stroke-dasharray", "3,3")
            .attr("stroke-width", 1)
            .attr("stroke", "#e50914")
            .attr("stroke-opacity", 1);

        // Hide lock icon and clear button
        vis.lockIcon
            .transition()
            .duration(200)
            .style("opacity", 0);

        vis.clearButton
            .transition()
            .duration(200)
            .style("opacity", 0)
            .style("pointer-events", "none");

        // Hide hairline (will reappear on mousemove)
        vis.hairlineGroup.style("opacity", 0);

        // Clear highlights on chart
        if (vis.onYearHover) {
            vis.onYearHover(null);
        }

        // Announce to screen readers
        vis.announce('Highlight cleared');

        console.log("Cleared lock");
    }

    // Announce action to screen readers via ARIA live region
    announce(message) {
        const announcer = document.getElementById('timeline-announcer');
        if (announcer) {
            announcer.textContent = message;
        }
    }

    // ===== Story Mode Programmatic Control Methods =====

    /**
     * Programmatically set brush selection (for story mode)
     * @param {Array|null} yearRange - [minYear, maxYear] or null to clear
     * @param {number} duration - Animation duration in milliseconds (default: 0)
     */
    programmaticBrush(yearRange, duration = 0) {
        let vis = this;

        // Store the duration for the callback to use
        vis.programmaticDuration = duration;

        if (!yearRange) {
            // Clear brush
            vis.brushGroup.transition().duration(duration)
                .call(vis.brush.move, null);
            setTimeout(() => {
                vis.programmaticDuration = 0;
            }, duration + 50);
            return;
        }

        // Convert years to pixel coordinates
        const [minYear, maxYear] = yearRange;
        const selection = [vis.xScale(minYear), vis.xScale(maxYear)];

        // Animate brush to new selection
        vis.brushGroup.transition().duration(duration)
            .call(vis.brush.move, selection);

        // Clear the duration flag after transition ends
        setTimeout(() => {
            vis.programmaticDuration = 0;
        }, duration + 50);
    }

    /**
     * Disable brush interactions (for story mode)
     */
    disableBrush() {
        let vis = this;

        // Remove brush event handlers
        vis.brushGroup.on(".brush", null);

        // Disable pointer events to prevent brush dragging
        vis.brushGroup.style("pointer-events", "none");
    }

    /**
     * Re-enable brush interactions
     */
    enableBrush() {
        let vis = this;

        // Re-enable pointer events
        vis.brushGroup.style("pointer-events", null);

        // Re-attach brush
        vis.brushGroup.call(vis.brush);
    }

    /**
     * Get current brush state for snapshot
     * @returns {Array|null} Current brush selection as [minYear, maxYear] or null
     */
    getBrushState() {
        let vis = this;

        const selection = d3.brushSelection(vis.brushGroup.node());
        if (!selection) return null;

        return selection.map(vis.xScale.invert);
    }
}