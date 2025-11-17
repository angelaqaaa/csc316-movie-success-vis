let myChart;
let myTimeline;
let storyManager;

// Initialize Welcome Panel
initWelcomePanel();

loadData();

function initWelcomePanel() {
    const welcomeOverlay = d3.select("#welcome-overlay");
    const exploreBtn = d3.select("#explore-own-btn");
    const guidedStoryBtn = d3.select("#start-guided-story-btn");

    // Clear any stale sessionStorage flags from previous sessions
    sessionStorage.removeItem("startStoryOnLoad");

    // Ensure overlay is visible on page load and freeze scrolling
    welcomeOverlay.classed("hidden", false);
    d3.select("body").classed("no-scroll", true);

    // Disable tab navigation to all elements except welcome buttons
    const disableTabNavigation = () => {
        // Disable tab navigation for all buttons, links, and inputs except welcome buttons
        d3.selectAll("button, a, input, select, textarea, [tabindex]")
            .each(function() {
                const element = d3.select(this);
                const id = element.attr("id");
                // Skip welcome panel buttons
                if (id !== "explore-own-btn" && id !== "start-guided-story-btn") {
                    element.attr("tabindex", "-1");
                }
            });
    };

    // Re-enable tab navigation
    const enableTabNavigation = () => {
        d3.selectAll("button, a, input, select, textarea")
            .attr("tabindex", null); // Remove tabindex attribute to restore default behavior
    };

    // Disable tab navigation initially
    disableTabNavigation();

    // Handle "Explore on Your Own" button
    exploreBtn.on("click", function() {
        // Explicitly clear story mode flag (in case it was set previously)
        sessionStorage.removeItem("startStoryOnLoad");

        // Dismiss welcome panel with fade out animation
        welcomeOverlay.style("opacity", 1)
            .transition()
            .duration(300)
            .style("opacity", 0)
            .on("end", function() {
                welcomeOverlay.classed("hidden", true);
                // Re-enable scrolling
                d3.select("body").classed("no-scroll", false);
                // Re-enable tab navigation
                enableTabNavigation();
            });

        console.log("User chose: Explore on Your Own");
    });

    // Handle "Start Guided Story" button
    guidedStoryBtn.on("click", function() {
        // Dismiss welcome panel with fade out animation
        welcomeOverlay.style("opacity", 1)
            .transition()
            .duration(300)
            .style("opacity", 0)
            .on("end", function() {
                welcomeOverlay.classed("hidden", true);
                // Re-enable scrolling
                d3.select("body").classed("no-scroll", false);
                // Re-enable tab navigation
                enableTabNavigation();

                // Start story mode after overlay is dismissed
                // Check if storyManager is already initialized (data loaded)
                if (storyManager) {
                    // Data already loaded - start story directly
                    setTimeout(function() {
                        storyManager.startStory();
                    }, 100);
                } else {
                    // Data not loaded yet - set flag for later
                    sessionStorage.setItem("startStoryOnLoad", "true");
                }
            });

        console.log("User chose: Start Guided Story");
    });
}

function loadData() {
    // Load data asynchronously
    d3.csv("data/imdb_top_1000.csv").then(data => {

        // Data processing: convert strings to numbers
        data = data.map(d => {
            // Remove commas from Gross and convert to number
            d.Gross = d.Gross ? +d.Gross.replace(/,/g, '') : 0;

            // Convert other numeric fields with validation
            d.Released_Year = +d.Released_Year;
            d.IMDB_Rating = +d.IMDB_Rating;
            d.Meta_score = d.Meta_score ? +d.Meta_score : null;
            d.No_of_Votes = +d.No_of_Votes;

            // Parse Runtime (remove " min" and convert to number)
            d.Runtime = +d.Runtime.replace(' min', '');

            return d;
        })
            // Filter out invalid data
            .filter(d => {
                return d.Gross > 0 &&
                    !isNaN(d.Released_Year) &&
                    d.Released_Year > 1900 &&
                    d.Released_Year < 2030 &&
                    !isNaN(d.IMDB_Rating) &&
                    !isNaN(d.No_of_Votes);
            });

        console.log("Data loaded:", data.length, "movies with valid gross data");

        // Hide loading indicator and show visualization (chart + timeline)
        d3.select("#loading-indicator").style("display", "none");
        d3.select("#visualization-content").style("display", "flex");
        d3.select(".visualization-continuation").style("display", "block");

        // Create main visualization
        myChart = new plotChart(null, data);

        // Create timeline slider with callbacks
        myTimeline = new Timeline("slider-chart", data,
            // onBrush callback: when brush changes, update the main chart
            function (yearRange) {
                // Pass duration if it's a programmatic brush from story mode
                const duration = myTimeline.programmaticDuration || 0;
                myChart.updateYearRange(yearRange, duration);
            },
            // onYearHover callback: when year is hovered on timeline, highlight scatter points
            function (year) {
                myChart.highlightYear(year);
            }
        );

        // Connect timeline to chart for bidirectional highlights
        myChart.setTimeline(myTimeline);

        // ===== Rating Split Threshold Control (in Legend) =====
        // Wait for legend to be created, then attach event handlers
        setTimeout(function() {
            const thresholdSlider = d3.select("#rating-threshold-slider");

            // Attach event listener to threshold slider
            thresholdSlider.on("input", function() {
                const threshold = +this.value;

                // Update ARIA attributes for accessibility
                d3.select(this)
                    .attr("aria-valuenow", threshold)
                    .attr("aria-valuetext", `High if rating is ${threshold.toFixed(1)} or above, Low otherwise`);

                myChart.updateRatingSplit(threshold);
            });
        }, 100);

        // Setup reset all filters button
        d3.select("#reset-filters").on("click", function() {
            // Reset genre selection to all
            myChart.selectedGenres.clear();
            myChart.genres.forEach(genre => myChart.selectedGenres.add(genre));

            // Update dropdown UI
            d3.select("#select-all").property("checked", true);
            d3.selectAll("#genre-dropdown input[type='checkbox']").property("checked", true);
            d3.select("#dropdown-text").text("Movie Genres");

            // Reset timeline brush
            myTimeline.brushGroup.call(myTimeline.brush.move, null);
            myChart.yearRange = null;

            // Clear timeline lock (if locked)
            if (myTimeline.isLocked) {
                myTimeline.clearLock();
            }

            // Reset legend filters and threshold
            myChart.resetLegend();

            // Reset zoom to default view
            myChart.resetZoom();

            // Clear context-click artifacts (reference lines and annotations)
            myChart.clearContextClick();

            // Clear any active spotlight effect
            if (myChart.clearSpotlight) {
                myChart.clearSpotlight();
            }
        });

        // Setup reset timeline button (new)
        d3.select("#reset-timeline").on("click", function() {
            // Reset timeline brush only
            myTimeline.brushGroup.call(myTimeline.brush.move, null);
            myChart.yearRange = null;

            // Clear timeline lock (if locked)
            if (myTimeline.isLocked) {
                myTimeline.clearLock();
            }

            // Update chart with current genre filters intact
            myChart.wrangleData();
        });

        // Remove focus from genre dropdown button after clicking
        d3.select("#genreDropdownButton").on("click", function() {
            // Delay blur slightly to allow Bootstrap dropdown to open
            setTimeout(() => this.blur(), 100);
        });

        // ===== Story Mode Initialization =====
        // Initialize story mode after chart and timeline are ready
        storyManager = new StoryManager(myChart, myTimeline);
        storyManager.init();

        console.log("Story Mode initialized");

        // Check if user clicked "Start Guided Story" from welcome panel
        if (sessionStorage.getItem("startStoryOnLoad") === "true") {
            sessionStorage.removeItem("startStoryOnLoad");
            // Delay story start to allow visualization to fully render
            setTimeout(function() {
                storyManager.startStory();
            }, 100);
        }

    }).catch(error => {
        console.error("Error loading data:", error);
    })
}

// Hide scroll indicator when user starts scrolling
window.addEventListener('scroll', function() {
    const viewportContent = document.querySelector('.viewport-content');
    if (viewportContent) {
        if (window.scrollY > 0) {
            viewportContent.style.setProperty('--scroll-indicator-opacity', '0');
        } else {
            viewportContent.style.setProperty('--scroll-indicator-opacity', '1');
        }
    }
});

// Close tip dropdown when clicking outside
document.addEventListener('click', function(event) {
    const instructionsCorner = document.querySelector('.instructions-corner');
    const details = instructionsCorner?.querySelector('details');

    // Check if click is outside the instructions-corner element
    if (instructionsCorner && details && details.open) {
        if (!instructionsCorner.contains(event.target)) {
            details.open = false;
        }
    }
});