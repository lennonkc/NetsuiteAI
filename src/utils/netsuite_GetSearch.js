/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */
define(['N/search', 'N/log'], function(search, log) {
    function getSavedSearchResults() {
        try {
            var searchId = 'customsearch20844'; // 你的 Saved Search ID
            var mySearch = search.load({ id: searchId });

            var results = [];
            var pagedData = mySearch.runPaged({ pageSize: 1000 });

            log.debug("Total Pages", pagedData.pageRanges.length); // 记录分页信息

            pagedData.pageRanges.forEach(function(pageRange) {
                var page = pagedData.fetch({ index: pageRange.index });
                page.data.forEach(function(result) {
                    results.push(resultToJSON(result));
                });
            });

            log.debug("Total Records Retrieved", results.length); // 记录返回的结果数量

            return { success: true, totalRecords: results.length, data: results };
        } catch (e) {
            log.error("Error Running Saved Search", e);
            return { success: false, message: e.message };
        }
    }

    function resultToJSON(result) {
        var columns = result.columns;
        var data = {};

        columns.forEach(function(column) {
            var fieldName = column.label || column.name;
            var fieldValue = result.getValue(column);
            var fieldText = result.getText(column);

            // 如果字段有 `getText()` 值，就返回 `文本值` 而不是 `ID`
            data[fieldName] = fieldText || fieldValue;
        });

        return data;
    }

    return { get: getSavedSearchResults };
});