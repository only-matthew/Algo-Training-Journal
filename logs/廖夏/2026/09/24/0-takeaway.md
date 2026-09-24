一开始自己写出来的BFS还保留着DFS的答案更新习惯，没有意识到在这个无权BFS上，第一次到达必然是最短路（每个节点都同时延申出去一次，如果本次到达，同批次后面的不会比本次的更好）。

因此，本轮的`if (floor == b) {res = min(res, num); continue;}`，完全可以改为`if (floor == b) {res=num; break;}`然后在外层进行`if （floor == b) cout << res; else cout << -1;`即可.