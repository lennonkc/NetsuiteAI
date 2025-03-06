/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 */
define(['N/search', 'N/log'], function(search, log) {
    function execute(scriptContext) {
        try {
            var searchId = 'customsearch20821'; // 原始 Saved Search ID
            var mySearch = search.load({ id: searchId });

            var newSearch = search.create({
                type: mySearch.searchType,  // 复制搜索的 Record Type
                filters: mySearch.filters.concat([
                    ["status", "noneof", ["Closed", "Fully Billed", "Rejected by Supervisor"]]
                ]),  // 添加新的 Status 过滤条件
                columns: mySearch.columns // 复制所有查询字段
            });

            // 运行新的 Saved Search
            var resultSet = newSearch.run();
            var results = [];

            resultSet.each(function(result) {
                results.push(result.id);
                return results.length < 10; // 只取前 10 条数据测试
            });

            log.debug("Copied Search Results", results);
        } catch (e) {
            log.error("Error Copying Saved Search", e);
        }
    }

    return { execute: execute };
});
