/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */
define(['N/search'], function(search) {
    function getSavedSearchResults() {
        var searchId = 'customsearch20821'; // 你的 Saved Search ID
        var mySearch = search.load({ id: searchId });

        var results = [];
        var pagedData = mySearch.runPaged({ pageSize: 1000 });

        pagedData.pageRanges.forEach(function(pageRange) {
            var page = pagedData.fetch({ index: pageRange.index });
            page.data.forEach(function(result) {
                results.push(resultToJSON(result));
            });
        });

        return { totalRecords: results.length, data: results };
    }

    function resultToJSON(result) {
        var columns = result.columns;
        var data = {};
        columns.forEach(function(column) {
            data[column.label || column.name] = result.getValue(column);
        });
        return data;
    }

    return { get: getSavedSearchResults };
});