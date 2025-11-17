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

        // Hide loading indicator and show visualization
        d3.select("#loading-indicator").style("display", "none");
        d3.select("#visualization-content").style("display", "flex");

        // Create main visualization
        myChart = new plotChart(null, data);

        // Create timeline slider with callback
        myTimeline = new Timeline("slider-chart", data, function (yearRange) {
            // Callback function: when brush changes, update the main chart
            myChart.updateYearRange(yearRange);
        });

        // Setup reset button
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

            // Update chart
            myChart.wrangleData();
        });

    }).catch(error => {
        console.error("Error loading data:", error);
    })
}