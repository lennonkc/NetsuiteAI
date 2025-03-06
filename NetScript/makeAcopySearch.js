/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 */
define(['N/search', 'N/record'], function(search, record) {
    function execute(scriptContext) {
        var searchId = 'customsearch20821'; // 原始 Saved Search ID
        var mySearch = search.load({ id: searchId });

        var newSearch = search.create({
            type: mySearch.searchType,
            filters: mySearch.filters,
            columns: mySearch.columns
        });

        var searchRecord = record.create({ type: record.Type.SAVED_SEARCH });
        searchRecord.setValue({ fieldId: 'title', value: 'customsearch_filtered_po' });
        searchRecord.setValue({ fieldId: 'recordtype', value: mySearch.searchType });
        searchRecord.save();
    }

    return { execute: execute };
});
