let myChart;
let myTimeline;

loadData();

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
                myChart.updateYearRange(yearRange);
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
                myChart.updateRatingSplit(threshold);
            });
        }, 100);

        // Setup reset all filters button
        d3.select("#reset-filters").on("click", function() {
            this.blur(); // Remove focus after click
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
        });

        // Setup reset timeline button (new)
        d3.select("#reset-timeline").on("click", function() {
            this.blur(); // Remove focus after click
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