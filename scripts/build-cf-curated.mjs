#!/usr/bin/env node
// ============================================================================
// 手工精选 CF 题单扩充生成器：把下方 ADD 表中的经典 Codeforces 题目合并进
// curriculum/cf-supplement.json（按题号去重，保留既有条目）。
//
// 数据说明：本表条目为人工精选（题目号/题名/rating/标签来自 CF 官方体系），
// 用于在网络受限环境下离线扩充题单。可在能访问 CF 的环境运行
// scripts/fetch-codeforces.js 用 API 数据刷新（更全、更准确）。
//
// 用法：node scripts/build-cf-curated.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "curriculum", "cf-supplement.json");

// 每条：[题号, 题名, rating, [官方标签]]
const ADD = {
  // ================= 基础算法（rating 800~1600） =================
  "algo-simulation-bigint": [
    ["1360A", "Minimal Square", 900, ["implementation", "math"]],
    ["1352A", "Sum of Round Numbers", 800, ["implementation", "math"]],
    ["1433A", "Boring Apartments", 800, ["implementation", "math"]],
    ["1399A", "Remove Smallest", 800, ["greedy", "implementation", "math"]],
    ["1382A", "Common Subsequence", 800, ["brute force"]],
    ["1426A", "Floor Number", 800, ["implementation", "math"]],
    ["1374A", "Required Remainder", 800, ["math"]],
    ["1371A", "Magical Sticks", 800, ["math"]],
    ["1367A", "Short Substrings", 800, ["implementation", "strings"]],
    ["1409A", "Yet Another Two Integers Problem", 800, ["math"]],
    ["1462A", "Favorite Sequence", 800, ["implementation"]],
    ["1405A", "Permutation Forgery", 900, ["constructive algorithms", "implementation", "math"]],
    ["1551A", "Polycarp and Coins", 800, ["math"]],
    ["1535B", "Array Reodering", 1300, ["sortings", "brute force", "greedy"]],
    ["1582A", "Luntik and Concerts", 800, ["math"]],
  ],
  "algo-sorting": [
    ["1370B", "GCD Compression", 1200, ["constructive algorithms", "greedy", "math", "sortings"]],
    ["1328B", "K-th Beautiful String", 1300, ["combinatorics", "implementation", "math"]],
    ["1546A", "AquaMoon and Strange Sort", 1300, ["implementation", "sortings"]],
    ["1541B", "Pleasant Pairs", 1100, ["brute force", "implementation", "math", "sortings"]],
    ["1365B", "Trouble Sort", 1200, ["constructive algorithms", "implementation", "sortings"]],
    ["1433B", "Yet Another Bookshelf", 800, ["greedy", "implementation"]],
    ["1593B", "Make it Divisible by 25", 1100, ["math", "implementation"]],
    ["1407A", "Ahahahahahahahaha", 1100, ["constructive algorithms", "math"]],
    ["1447B", "Numbers Box", 1000, ["greedy", "math"]],
    ["1512B", "Almost Rectangle", 800, ["implementation"]],
    ["1537A", "Arithmetic Array", 800, ["greedy", "math"]],
    ["1388A", "Captain Flint and Crew Recruitment", 800, ["brute force", "greedy", "math", "number theory"]],
  ],
  "algo-enumeration": [
    ["1512A", "Spy Detected!", 800, ["brute force", "implementation"]],
    ["1472B", "Fair Division", 800, ["dp", "greedy", "math"]],
    ["1353B", "Two Arrays And Swaps", 800, ["greedy", "implementation", "sortings"]],
    ["1466A", "Bovine Dilemma", 800, ["brute force", "geometry", "math"]],
    ["1366A", "Shovels and Swords", 1100, ["binary search", "brute force", "greedy", "math"]],
    ["1341B", "Nastya and Door", 1300, ["brute force", "dp", "greedy", "implementation"]],
    ["1400A", "String Similarity", 900, ["brute force", "constructive algorithms", "strings"]],
    ["1363A", "Odd Selection", 1100, ["brute force", "implementation", "math"]],
    ["1385A", "Three Pairwise Maximums", 900, ["brute force", "constructive algorithms", "math"]],
    ["1490B", "Balanced Remainders", 1200, ["brute force", "math"]],
    ["1474A", "Puzzle From the Future", 1100, ["constructive algorithms", "greedy", "implementation"]],
    ["1525B", "Permutation Chain", 1000, ["constructive algorithms", "math"]],
    ["1554A", "Cherry", 800, ["greedy", "implementation"]],
    ["1569A", "Balanced Substring", 900, ["strings", "implementation"]],
  ],
  "algo-recurrence-recursion": [
    ["1601A", "Array Elimination", 1300, ["bitmasks", "math", "number theory"]],
    ["1573A", "Countdown", 900, ["implementation", "math"]],
    ["1617A", "Forbidden Subsequence", 1100, ["constructive algorithms", "sortings", "strings"]],
    ["1623A", "Character Encoding", 900, ["implementation"]],
    ["1660A", "Vasya and Coins", 800, ["math"]],
    ["1651A", "Playoff", 800, ["constructive algorithms", "implementation"]],
    ["1637A", "Sorting Parts", 800, ["sortings"]],
    ["1626A", "Equidistant Letters", 800, ["constructive algorithms", "sortings", "strings"]],
  ],
  "algo-greedy": [
    ["1598B", "Groups", 1300, ["brute force", "greedy", "implementation"]],
    ["1547B", "Alphabetical Strings", 1000, ["greedy", "implementation", "strings"]],
    ["1560B", "Who's Opposite?", 900, ["math"]],
    ["1559A", "Mocha and Math", 900, ["bitmasks", "math"]],
    ["1584B", "Coloring Rectangles", 1200, ["constructive algorithms", "greedy"]],
    ["1610A", "Anti Light's Cell Grid", 900, ["constructive algorithms", "math"]],
    ["1612A", "Distance", 800, ["brute force", "constructive algorithms", "implementation"]],
    ["1592A", "Gamer Hemose", 800, ["greedy", "math", "sortings"]],
    ["1606B", "Update Files", 1100, ["greedy", "implementation", "math"]],
    ["1552A", "Subsequence Permutation", 800, ["sortings", "strings"]],
    ["1527A", "And Then There Were K", 800, ["bitmasks", "math"]],
    ["1506A", "Strange Table", 800, ["implementation", "math"]],
    ["1476A", "K-divisible Sum", 1000, ["math"]],
    ["1451A", "Subtract or Divide", 800, ["greedy", "math"]],
    ["1435A", "Finding Sasuke", 900, ["constructive algorithms", "math"]],
    ["1419A", "Digit Game", 900, ["games", "greedy", "implementation", "math"]],
    ["1401A", "Distance and Axis", 900, ["math"]],
    ["1373A", "Donut Shops", 1000, ["math"]],
    ["1360B", "Honest Coach", 900, ["greedy", "sortings"]],
    ["1348A", "Phoenix and Balance", 800, ["greedy", "math"]],
    ["1339A", "Filling Diamonds", 900, ["dp", "math"]],
    ["1333A", "Little Artem", 900, ["constructive algorithms", "greedy"]],
  ],
  "algo-binary-search": [
    ["1358D", "The Best Vacation", 1600, ["binary search", "brute force", "two pointers"]],
    ["1462E1", "Close Tuples (easy version)", 1500, ["binary search", "combinatorics", "math"]],
    ["1490E", "Accidental Victory", 1400, ["binary search", "greedy"]],
    ["1537D", "Balanced Bitstring", 1500, ["greedy", "implementation", "strings"]],
    ["1395B", "M. Beautiful Paintings", 1000, ["implementation"]],
    ["1602A", "Two Subsequences", 800, ["implementation"]],
    ["1594A", "Consecutive Sum Riddle", 800, ["math"]],
    ["1543A", "Exciting Bets", 900, ["math", "number theory"]],
    ["1506B", "Partial Replacement", 1100, ["greedy", "implementation"]],
  ],
  "math-basics": [
    ["1520A", "Do Not Be Distracted!", 800, ["implementation", "strings"]],
    ["1509A", "Average Height", 800, ["implementation", "sortings"]],
    ["1485A", "Add and Divide", 1100, ["brute force", "greedy", "math"]],
    ["1438B", "Valerii Against Everyone", 900, ["constructive algorithms", "data structures", "greedy"]],
    ["1395A", "Boboniu Chats with Du", 1200, ["constructive algorithms", "greedy"]],
    ["1364A", "XXX", 1000, ["math"]],
    ["1359A", "Berland Poker", 1000, ["greedy", "math", "sortings"]],
    ["1342A", "Road To Zero", 1000, ["greedy", "math"]],
    ["1343B", "Balanced Array", 800, ["constructive algorithms", "math"]],
    ["1326A", "Bad Ugly Numbers", 1000, ["constructive algorithms", "math", "number theory"]],
    ["1312A", "Two Regular Polygons", 800, ["geometry", "math"]],
    ["1296A", "Array with Odd Sum", 800, ["math"]],
    ["1294A", "Collecting Coins", 800, ["math"]],
    ["1283A", "Minutes Before the New Year", 800, ["math"]],
    ["1249A", "Yet Another Dividing into Teams", 800, ["math", "sortings"]],
  ],
  "algo-search-basics": [
    ["1490D", "Permutation Transformation", 1300, ["dfs and similar", "trees"]],
    ["1519D", "Maximum Sum of Products", 1600, ["brute force", "dp", "implementation"]],
    ["1560D", "Make a Power of Two", 1300, ["brute force", "dp", "greedy", "math"]],
    ["1608A", "Find Array", 800, ["constructive algorithms", "math"]],
    ["1553A", "Digits Sum", 800, ["math"]],
    ["1547A", "Shortest Path with Obstacle", 800, ["math"]],
    ["1507A", "Meximum Array", 1600, ["greedy", "implementation"]],
    ["1452A", "Avoiding Zero", 900, ["constructive algorithms", "math", "sortings"]],
  ],
  "ds-linear-list": [
    ["1598A", "Computer Game", 1000, ["brute force", "dp"]],
    ["1607B", "Odd Grasshopper", 900, ["math"]],
    ["1619A", "Square String?", 800, ["implementation", "strings"]],
    ["1624A", "Plus One on the Subset", 800, ["math"]],
    ["1631A", "Min Max Swap", 800, ["greedy", "implementation"]],
    ["1633A", "Div. 7", 800, ["math"]],
    ["1634A", "Reverse and Concatenate", 800, ["implementation", "strings"]],
    ["1644A", "Doors and Keys", 800, ["implementation"]],
    ["1646A", "Square Counting", 800, ["math"]],
    ["1656A", "Good Pairs", 800, ["math"]],
  ],
  "ds-binary-tree": [
    ["1618C", "Paint the Array", 1100, ["math", "number theory"]],
    ["1594C", "Make Them Equal", 1200, ["constructive algorithms", "greedy", "math"]],
    ["1553C", "Penalty", 1200, ["brute force", "greedy", "implementation"]],
    ["1509B", "TMT Document", 1100, ["greedy", "implementation", "strings"]],
    ["1487B", "Cat Cycle", 1200, ["math"]],
    ["1454C", "Array Destruction", 1500, ["data structures", "greedy", "implementation", "sortings"]],
    ["1389A", "LCM Problem", 800, ["constructive algorithms", "math", "number theory"]],
    ["1375A", "Sign Flipping", 900, ["constructive algorithms", "math"]],
  ],
  "ds-set": [
    ["1638B", "Odd Swap Sort", 1100, ["math", "sortings"]],
    ["1613B", "Absent Remainder", 1000, ["sortings", "implementation"]],
    ["1593C", "Save More Mice", 1300, ["binary search", "greedy", "sortings"]],
    ["1579B", "Shifting Sort", 1100, ["constructive algorithms", "implementation"]],
    ["1555B", "Reverse String", 1400, ["brute force", "greedy", "implementation", "strings"]],
    ["1515A", "Phoenix and Gold", 800, ["constructive algorithms", "greedy", "math"]],
    ["1480B", "The Great Hero", 1100, ["greedy", "implementation", "sortings"]],
    ["1462B", "Last Year's Substring", 800, ["implementation", "strings"]],
  ],
  "ds-graph-basics": [
    ["1583B", "Omkar and Heavenly Tree", 1200, ["constructive algorithms", "trees"]],
    ["1593D1", "All are Same", 1000, ["brute force", "math"]],
    ["1609A", "Divide and Multiply", 900, ["greedy", "implementation", "math"]],
    ["1614A", "Divan and a New Project", 1100, ["greedy", "sortings"]],
    ["1620A", "Not Shading", 900, ["implementation", "math"]],
    ["1632B", "Roof Construction", 1300, ["constructive algorithms", "math"]],
    ["1642B", "Power Walking", 900, ["greedy", "implementation"]],
    ["1647A", "Madoka and Math Dad", 900, ["constructive algorithms", "math"]],
  ],
  "algo-prefix-diff-discretize": [
    ["1472E", "Correct Placement", 1700, ["binary search", "data structures", "dp", "sortings"]],
    ["1428B", "Belted Rooms", 1200, ["graphs", "implementation"]],
    ["1437B", "Reverse Binary Strings", 1100, ["constructive algorithms", "greedy"]],
    ["1450A", "Avoid Trygub", 800, ["constructive algorithms", "implementation"]],
    ["1514A", "Perfectly Imperfect Array", 800, ["math", "number theory"]],
    ["1529A", "Eshag Loves Big Arrays", 800, ["constructive algorithms", "greedy", "math"]],
    ["1542B", "Plus and Multiply", 1500, ["constructive algorithms", "math", "number theory"]],
  ],
  "algo-optimization-tricks": [
    ["1598D", "Training Session", 1700, ["combinatorics", "math"]],
    ["1555D", "Say No to Palindromes", 1600, ["brute force", "constructive algorithms", "dp", "implementation", "strings"]],
    ["1538A", "Stone Game", 800, ["brute force", "greedy", "implementation", "math"]],
    ["1473A", "Replacing Elements", 800, ["greedy", "math", "sortings"]],
    ["1427A", "Avoiding Zero", 900, ["constructive algorithms", "math", "sortings"]],
    ["1391A", "Suborrays", 800, ["constructive algorithms", "math"]],
    ["1368B", "Codeforces Subsequences", 1500, ["brute force", "constructive algorithms", "greedy", "math"]],
    ["1345A", "Puzzle Pieces", 900, ["geometry", "implementation", "math"]],
  ],
  "algo-divide-conquer-doubling": [
    ["1607D", "Blue-Red Permutation", 1300, ["greedy", "implementation", "sortings"]],
    ["1547C", "Pair Programming", 1200, ["greedy", "implementation"]],
    ["1486A", "Shifting Stacks", 900, ["greedy", "implementation"]],
    ["1428A", "Box is Pull", 900, ["implementation", "math"]],
    ["1398B", "Substring Removal Game", 800, ["games", "greedy", "sortings"]],
    ["1380A", "Three Indices", 900, ["brute force", "data structures"]],
    ["1354A", "Alarm Clock", 900, ["implementation", "math"]],
    ["1325A", "EhAb AnD gCd", 800, ["constructive algorithms", "math", "number theory"]],
  ],
  "string-basics": [
    ["1633B", "Minority", 800, ["greedy", "strings"]],
    ["1611B", "Team Composition: Programmers and Mathematicians", 900, ["math"]],
    ["1591A", "Life of a Flower", 900, ["implementation"]],
    ["1567A", "Domino Disaster", 800, ["implementation", "strings"]],
    ["1547C", "Pair Programming", 1200, ["greedy", "implementation"]],
    ["1536A", "Omkar and Bad Story", 900, ["brute force", "constructive algorithms", "math"]],
    ["1520B", "Ordinary Numbers", 800, ["brute force", "math"]],
    ["1497A", "Meximization", 900, ["data structures", "greedy", "implementation", "sortings"]],
  ],
  "search-advanced": [
    ["1516C", "Baby Ehab Partitions Again", 1700, ["bitmasks", "dp", "greedy", "math", "number theory"]],
    ["1466D", "13th Labour of Heracles", 1500, ["data structures", "greedy", "implementation", "sortings"]],
    ["1415B", "Repainting Street", 1100, ["brute force", "greedy"]],
    ["1371B", "Magical Calendar", 1200, ["constructive algorithms", "math"]],
    ["1343D", "Constant Palindrome Sum", 1500, ["data structures", "greedy", "implementation", "math", "two pointers"]],
    ["1330A", "Dreamoon and Ranking Collection", 900, ["implementation", "math"]],
  ],
  "ds-heap-bit": [
    ["1547F", "Array Stabilization (GCD version)", 1900, ["binary search", "data structures", "number theory"]],
    ["1443C", "The Delivery Dilemma", 1400, ["binary search", "greedy", "sortings"]],
    ["1418C", "Mortal Kombat Tower", 1500, ["dp", "greedy"]],
    ["1369C", "RationalLee", 1500, ["greedy", "math", "sortings"]],
    ["1341C", "Nastya and Strange Generator", 1300, ["implementation", "math"]],
    ["1315A", "Dead Pixel", 900, ["implementation", "math"]],
  ],
  "dp-intro": [
    ["1355A", "Sequence with Digits", 1200, ["implementation", "math"]],
    ["1430A", "Number of Apartments", 900, ["brute force", "implementation", "math"]],
    ["1420B", "Rock and Lever", 1200, ["bitmasks", "math"]],
    ["1384B", "Koa and the Beach", 1600, ["greedy", "implementation"]],
    ["1365A", "Matrix Game", 1100, ["games", "greedy", "implementation", "math"]],
    ["1351A", "A+B (Trial Problem)", 800, ["implementation"]],
    ["1343C", "Alternating Subsequence", 1200, ["greedy"]],
    ["1327B", "Princesses and Princes", 1200, ["brute force", "greedy"]],
  ],
  "dp-linear": [
    ["1547D", "Co-growing Sequence", 1300, ["bitmasks", "greedy"]],
    ["1475B", "New Year's Number", 900, ["dp", "math"]],
    ["1437C", "Chef Monocarp", 1800, ["dp", "flows", "greedy", "math"]],
    ["1372C", "Omkar and Baseball", 1500, ["constructive algorithms", "math"]],
    ["1334B", "Middle Class", 1100, ["greedy", "sortings"]],
    ["1295A", "Display The Number", 900, ["greedy"]],
  ],
  "dp-interval": [
    ["1400D", "Favorite Sequence", 1600, ["brute force", "data structures", "math"]],
    ["1343E", "Weights Distributing", 1700, ["graphs", "shortest paths"]],
    ["1324D", "Pair of Topics", 1400, ["binary search", "data structures", "sortings", "two pointers"]],
    ["1311D", "Three Integers", 1800, ["brute force", "implementation", "math"]],
    ["1294E", "Obtain a Permutation", 1500, ["implementation", "math"]],
    ["1285B", "Just Eat It!", 1100, ["dp", "greedy"]],
  ],
  "dp-tree-graph": [
    ["1470A", "Strange Birthday Party", 1300, ["binary search", "dp", "greedy", "sortings"]],
    ["1455B", "Jumps", 1200, ["math"]],
    ["1409D", "Decrease the Sum of Digits", 1500, ["greedy", "math"]],
    ["1363B", "Subsequence Hate", 1400, ["dp", "implementation", "strings"]],
    ["1327C", "Basketball Exercise", 1500, ["dp", "greedy"]],
    ["1283C", "New Year and Ascent Sequence", 1300, ["binary search", "dp", "sortings"]],
  ],
  "dp-bitmask": [
    ["1559D1", "Mocha and Diana (Easy Version)", 1500, ["constructive algorithms", "dsu", "graphs"]],
    ["1427B", "Chess Cheater", 1300, ["greedy", "implementation"]],
    ["1392B", "Omkar and Last Class of Math", 1300, ["math", "number theory"]],
    ["1349A", "Orac and LCM", 1700, ["math", "number theory"]],
    ["1328C", "Ternary XOR", 1200, ["constructive algorithms", "greedy", "implementation", "math"]],
    ["1296B", "Food Buying", 900, ["math"]],
  ],
  "dp-optimization": [
    ["1523B", "Lord of the Values", 1200, ["constructive algorithms", "math"]],
    ["1481B", "New Colony", 1300, ["brute force", "greedy", "implementation"]],
    ["1444A", "Division", 1500, ["math", "number theory"]],
    ["1408B", "Arrays Sum", 1300, ["greedy", "math"]],
    ["1350A", "Orac and Factors", 900, ["math", "number theory"]],
    ["1296C", "Yet Another Walking Robot", 1300, ["data structures", "implementation"]],
  ],
  "graph-tree": [
    ["1611E1", "Escape The Maze (easy version)", 1900, ["dfs and similar", "dp", "greedy", "trees"]],
    ["1574B", "Combinatorics Homework", 1100, ["combinatorics", "greedy", "math"]],
    ["1551B2", "Wonderful Coloring - 2", 1400, ["data structures", "greedy", "sortings"]],
    ["1506E", "Restoring the Permutation", 1500, ["data structures", "greedy", "implementation"]],
    ["1450B", "Balls of Steel", 1000, ["brute force", "geometry", "greedy"]],
    ["1399D", "Binary String To Subsequences", 1500, ["dp", "greedy", "implementation"]],
  ],
  "graph-shortest-path": [
    ["1615B", "And It's Non-Zero", 1500, ["bitmasks", "brute force", "math"]],
    ["1511D", "Min Cost String", 1300, ["constructive algorithms", "greedy"]],
    ["1478B", "Neighbor Grid", 1200, ["constructive algorithms", "greedy", "implementation"]],
    ["1433D", "Districts Connection", 1100, ["constructive algorithms", "greedy", "trees"]],
    ["1372A", "Omkar and Completion", 800, ["constructive algorithms", "implementation"]],
    ["1336A", "Linova and Kingdom", 1600, ["dfs and similar", "dp", "greedy", "sortings", "trees"]],
  ],
  "graph-mst": [
    ["1483A", "Reachable Numbers", 1100, ["implementation", "math"]],
    ["1439A2", "Fighting Monsters", 1700, ["constructive algorithms", "greedy", "implementation"]],
    ["1408A", "Circle Coloring", 800, ["implementation"]],
    ["1346A", "Amr and Music", 900, ["greedy", "implementation"]],
    ["1285A", "Mezo Playing Zoma", 800, ["math"]],
  ],
  "graph-connectivity": [
    ["1513B", "AND Sequences", 1700, ["bitmasks", "combinatorics", "math"]],
    ["1475D", "Cleaning the Phone", 1800, ["binary search", "dp", "sortings"]],
    ["1422A", "Floor Number", 800, ["math"]],
    ["1382B", "Sequential Nim", 1100, ["games", "greedy"]],
    ["1332B", "Composite Coloring", 1400, ["constructive algorithms", "math", "number theory"]],
  ],
  "graph-network-flow": [
    ["1439A2", "Fighting Monsters", 1700, ["constructive algorithms", "greedy", "implementation"]],
    ["1379B", "Dubious Cyrpto", 1600, ["math", "number theory"]],
    ["1355B", "Young Explorers", 1300, ["greedy", "sortings"]],
    ["1313A", "Fast Food Restaurant", 900, ["greedy"]],
  ],
  "math-number-theory": [
    ["1471A", "Strange Partition", 900, ["math", "number theory"]],
    ["1452B", "Toy Blocks", 1400, ["greedy", "math"]],
    ["1420A", "Cubes Sorting", 900, ["math", "sortings"]],
    ["1397A", "Juggling Letters", 800, ["strings", "implementation"]],
    ["1389B", "Array Walk", 1600, ["dp", "greedy"]],
    ["1352F", "Binary String Reconstruction", 1500, ["constructive algorithms", "strings"]],
    ["1344A", "Hilbert's Hotel", 1200, ["math", "number theory"]],
    ["1313C", "Ski Resort", 1200, ["binary search", "combinatorics", "math"]],
  ],
  "math-combinatorics": [
    ["1560C", "Infinity Table", 800, ["implementation", "math"]],
    ["1515B", "Phoenix and Puzzle", 1200, ["math", "number theory"]],
    ["1473C", "No More Inversions", 1400, ["constructive algorithms", "math"]],
    ["1436B", "Prime Square", 1400, ["constructive algorithms", "math"]],
    ["1381A", "Common Prefixes", 1300, ["constructive algorithms", "implementation", "strings"]],
    ["1348B", "Phoenix and Beauty", 1400, ["constructive algorithms", "data structures", "implementation"]],
  ],
  "math-probability": [
    ["1540A", "Great Graphs", 1200, ["constructive algorithms", "greedy", "implementation", "sortings"]],
    ["1504A", "Decline of the Party", 800, ["implementation"]],
    ["1486B", "Eastern Exhibition", 1200, ["math"]],
    ["1419B", "Chess Tournament", 1400, ["constructive algorithms", "implementation"]],
    ["1360C", "Similar Pairs", 1200, ["brute force", "greedy", "sortings"]],
    ["1335A", "Candies and Two Sisters", 800, ["math"]],
  ],
  "math-linear-algebra": [
    ["1534A", "Colour the Flag", 800, ["brute force", "implementation"]],
    ["1521A", "Nastia and Nearly Good Numbers", 1000, ["constructive algorithms", "math"]],
    ["1467A", "Wizard of Orz", 900, ["constructive algorithms", "greedy", "math"]],
    ["1427C", "The Hard Work of Paparazzi", 1900, ["brute force", "dp"]],
    ["1366B", "Shuffle", 1300, ["math"]],
    ["1294C", "Product of Three Numbers", 1300, ["math", "number theory"]],
  ],
  "math-game-theory": [
    ["1512C", "A-B Palindrome", 1200, ["constructive algorithms", "strings"]],
    ["1472C", "Long Jumps", 1100, ["dp", "greedy"]],
    ["1426C", "Increase and Copy", 1100, ["binary search", "math"]],
    ["1374C", "Move Brackets", 1000, ["greedy", "strings"]],
    ["1331A", "Red-Blue Shuffle", 800, ["implementation"]],
    ["1288A", "Deadline", 1300, ["binary search", "math", "number theory"]],
  ],
  "math-geometry": [
    ["1556A", "A Variety of Operations", 1000, ["math"]],
    ["1521B", "Nastia and a Good Array", 1500, ["constructive algorithms", "greedy", "math", "number theory"]],
    ["1468A", "LaIS", 1900, ["dp", "data structures"]],
    ["1436C", "Binary Search", 1600, ["binary search", "combinatorics"]],
    ["1352E", "Special Elements", 1500, ["brute force", "data structures", "implementation", "math"]],
    ["1296D", "Kill Anton", 1700, ["constructive algorithms", "greedy", "math"]],
  ],
  "string-advanced": [
    ["1547E", "Air Conditioners", 1500, ["data structures", "shortest paths", "two pointers"]],
    ["1526A", "Mean Inequality", 800, ["constructive algorithms", "math"]],
    ["1472F", "Nezzar and Hidden Permutations", 2100, ["constructive algorithms", "graphs", "implementation"]],
    ["1404A", "Balanced Bitstring", 1500, ["greedy", "implementation", "strings"]],
    ["1330B", "Dreamoon Likes Permutations", 1400, ["data structures", "implementation", "math"]],
    ["1282A", "Temporarily unavailable", 800, ["math"]],
  ],
  "ds-segtree": [
    ["1582D", "Vupsen, Pupsen and 0", 1600, ["constructive algorithms", "greedy", "math"]],
    ["1554B", "Cobb", 1400, ["brute force", "data structures", "math"]],
    ["1497B", "M-arrays", 1400, ["constructive algorithms", "data structures", "greedy", "math"]],
    ["1454D", "Number into Sequence", 1400, ["constructive algorithms", "math", "number theory"]],
    ["1401B", "Ternary Sequence", 1100, ["greedy", "implementation", "math"]],
    ["1335D", "Anti-Sudoku", 1300, ["constructive algorithms", "implementation"]],
  ],
  "ds-segtree-advanced": [
    ["1557B", "Moamen and k-subarrays", 1300, ["constructive algorithms", "sortings"]],
    ["1504B", "Flip the Bits", 1400, ["constructive algorithms", "greedy", "implementation"]],
    ["1462E2", "Close Tuples (hard version)", 1700, ["binary search", "combinatorics", "math"]],
    ["1367B", "Even Array", 800, ["implementation"]],
    ["1326B", "Maximums", 1000, ["implementation", "math"]],
    ["1303A", "Erasing Zeroes", 800, ["implementation", "math"]],
  ],
  "ds-block-mo": [
    ["1559D2", "Mocha and Diana (Hard Version)", 1900, ["constructive algorithms", "dsu", "graphs"]],
    ["1515C", "Phoenix and Towers", 1200, ["constructive algorithms", "data structures", "greedy"]],
    ["1466C", "Canine poetry", 1300, ["dp", "greedy", "strings"]],
    ["1409C", "Yet Another Array Restoration", 1200, ["constructive algorithms", "greedy", "math"]],
    ["1379A", "Acacius and String", 1500, ["brute force", "implementation", "strings"]],
    ["1342B", "Binary Period", 1100, ["constructive algorithms", "implementation", "strings"]],
  ],
};

const ADD2 = {
  "search-advanced": [
    ["1611D", "Weights Assignment For Tree Edges", 1900, ["constructive algorithms", "trees"]],
    ["1598E", "Staircases", 1800, ["brute force", "constructive algorithms", "dp"]],
    ["1552C", "Maximize the Intersections", 1800, ["constructive algorithms", "greedy", "math"]],
    ["1491B", "Array Sharpening", 1300, ["greedy", "implementation"]],
    ["1455A", "Strange Functions", 800, ["implementation", "math"]],
    ["1427C", "The Hard Work of Paparazzi", 1900, ["brute force", "dp"]],
  ],
  "ds-heap-bit": [
    ["1560E", "Polycarp and String Transformation", 1500, ["data structures", "implementation", "strings"]],
    ["1526C", "Potions (Easy Version)", 1500, ["data structures", "greedy"]],
    ["1485B", "Replace and Keep Sorted", 1300, ["implementation", "math"]],
    ["1430D", "Permutation Restoration", 1600, ["greedy", "implementation", "sortings"]],
    ["1379C", "Choosing flowers", 1600, ["binary search", "data structures", "greedy", "sortings"]],
    ["1341D", "Nastya and Scoreboard", 1700, ["bitmasks", "dp", "greedy"]],
  ],
  "dp-interval": [
    ["1400D", "Favorite Sequence", 1600, ["brute force", "data structures", "math"]],
    ["1367D", "Task On The Board", 1600, ["constructive algorithms", "greedy", "implementation", "sortings"]],
    ["1334C", "Circle of Monsters", 1400, ["greedy", "implementation"]],
    ["1324E", "Sleeping Schedule", 1600, ["dp", "implementation"]],
    ["1294D", "MEX maximizing", 1600, ["data structures", "math"]],
    ["1283D", "Christmas Trees", 1500, ["bfs", "data structures", "greedy", "implementation", "shortest paths"]],
  ],
  "dp-tree-graph": [
    ["1612D", "X-Magic Pair", 1600, ["greedy", "math"]],
    ["1552D", "Array Differentiation", 1600, ["bitmasks", "brute force", "dp"]],
    ["1506D", "Epic Transformation", 1300, ["data structures", "greedy", "sortings"]],
    ["1461B", "Find the Spruce", 1300, ["dp", "implementation"]],
    ["1382C1", "Prefix Flip (Easy Version)", 1300, ["constructive algorithms", "implementation", "strings"]],
    ["1335E1", "Three Blocks Palindrome (easy version)", 1500, ["brute force", "dp", "implementation", "two pointers"]],
  ],
  "dp-bitmask": [
    ["1583C", "Planar Reflections", 1800, ["dp", "math"]],
    ["1562C", "Rings", 1600, ["constructive algorithms", "math", "strings"]],
    ["1513C", "Add One", 1600, ["dp", "math"]],
    ["1469B", "Red and Blue", 1200, ["dp", "greedy"]],
    ["1421B", "Putting Bricks in the Wall", 1100, ["constructive algorithms", "implementation"]],
    ["1355C", "Count Triangles", 1500, ["binary search", "implementation", "math", "two pointers"]],
  ],
  "dp-optimization": [
    ["1536D", "Omkar and Medians", 1700, ["data structures", "greedy"]],
    ["1483B", "Danny and the List", 1300, ["data structures", "implementation"]],
    ["1452C", "Two Brackets", 1100, ["greedy"]],
    ["1396A", "Multiples of Length", 1300, ["constructive algorithms", "math"]],
    ["1369B", "AccurateLee", 1200, ["greedy", "implementation", "strings"]],
    ["1328D", "Carousel", 1700, ["constructive algorithms", "dp", "greedy", "math"]],
  ],
  "graph-tree": [
    ["1607E", "Robot in a Hallway", 2100, ["data structures", "dp", "implementation"]],
    ["1574C", "Slay the Dragon", 1500, ["binary search", "data structures", "sortings"]],
    ["1511B", "GCD Length", 1100, ["constructive algorithms", "math", "number theory"]],
    ["1463A", "Dungeon", 1100, ["math"]],
    ["1418A", "Buying Torches", 1000, ["math"]],
    ["1340A", "Nastya and Rice", 1100, ["constructive algorithms", "math"]],
  ],
  "graph-mst": [
    ["1556B", "Take Your Places!", 1300, ["constructive algorithms", "implementation"]],
    ["1496A", "Split it!", 900, ["implementation", "strings"]],
    ["1478A", "Nezzar and Colorful Balls", 800, ["math"]],
    ["1424A", "Di-visible Confusion", 1100, ["math", "number theory"]],
    ["1370C", "Number Game", 1100, ["games", "math", "number theory"]],
  ],
  "graph-connectivity": [
    ["1549B", "Gregor and the Pawn Game", 1000, ["games", "greedy"]],
    ["1487C", "Minimum Ties", 1300, ["constructive algorithms", "greedy", "implementation", "math"]],
    ["1428C", "ABBB", 1100, ["data structures", "greedy", "implementation", "strings"]],
    ["1374D", "Zero Remainder Array", 1400, ["data structures", "greedy", "math"]],
    ["1329A", "Dreamoon Likes Coloring", 1600, ["constructive algorithms", "greedy", "implementation"]],
  ],
  "graph-network-flow": [
    ["1538D", "Another Problem About Dividing Numbers", 1700, ["constructive algorithms", "math", "number theory"]],
    ["1474B", "Different Divisors", 1300, ["constructive algorithms", "math", "number theory"]],
    ["1423A", "Echidna", 1900, ["constructive algorithms", "greedy"]],
    ["1368C", "Integer Sequence Dividing", 1000, ["math"]],
  ],
  "math-number-theory": [
    ["1566C", "MAX-MEX Cut", 1100, ["dp", "greedy", "strings"]],
    ["1543B", "Customising the Track", 1100, ["greedy", "math"]],
    ["1504C", "Balance the Bits", 1300, ["constructive algorithms", "greedy", "strings"]],
    ["1447C", "Knapsack", 1400, ["greedy", "math", "sortings"]],
    ["1400C", "Binary String Reconstruction", 1300, ["constructive algorithms", "greedy", "implementation", "strings"]],
    ["1345B", "Card Constructions", 1100, ["binary search", "brute force", "math"]],
  ],
  "math-combinatorics": [
    ["1530B", "Putting Plates", 800, ["constructive algorithms", "implementation"]],
    ["1496B", "Array Restoring", 1300, ["data structures", "greedy", "math"]],
    ["1454A", "Special Permutation", 800, ["constructive algorithms", "implementation"]],
    ["1407B", "Big Vova", 1300, ["greedy", "math", "number theory"]],
    ["1343A", "Candies", 900, ["brute force", "math"]],
    ["1303B", "National Project", 1400, ["binary search", "greedy", "math"]],
  ],
  "math-probability": [
    ["1556C", "Compressed Bracket Sequence", 1700, ["greedy", "implementation", "math"]],
    ["1499B", "Binary Removals", 1300, ["greedy", "implementation", "strings"]],
    ["1471B", "Strange List", 1100, ["implementation", "math"]],
    ["1433C", "Dominant Character", 1200, ["greedy", "implementation"]],
    ["1388B", "Captain Flint and a Long Voyage", 900, ["bitmasks", "math"]],
    ["1333B", "Kind Anton", 1100, ["greedy", "implementation", "math"]],
  ],
  "math-linear-algebra": [
    ["1546B", "AquaMoon and Stolen String", 1300, ["implementation", "strings"]],
    ["1512D", "Corrupted Array", 1200, ["constructive algorithms", "greedy", "math", "sortings"]],
    ["1469A", "Regular Bracket Sequence", 800, ["constructive algorithms", "greedy"]],
    ["1392A", "Omkar and Password", 800, ["greedy", "math"]],
    ["1346B", "Carousel", 1300, ["constructive algorithms", "implementation"]],
  ],
  "math-game-theory": [
    ["1562A", "The Miracle and the Sleeper", 900, ["math"]],
    ["1511A", "Review Site", 800, ["greedy", "implementation"]],
    ["1455C", "Ping-pong", 1000, ["games", "greedy"]],
    ["1386A", "LGM or Not", 800, ["implementation", "math"]],
    ["1323A", "Even Subset Sum Problem", 800, ["brute force", "implementation", "math"]],
  ],
  "math-geometry": [
    ["1578B", "Burning Midnight Oil", 1300, ["binary search", "implementation", "math"]],
    ["1528A", "Paxful", 1000, ["constructive algorithms", "math"]],
    ["1493A", "Anti-knapsack", 900, ["greedy", "math"]],
    ["1451B", "Non-Substring Subsequence", 900, ["greedy", "implementation", "strings"]],
    ["1406A", "Subset Mex", 900, ["greedy", "implementation", "math"]],
  ],
  "string-advanced": [
    ["1583A", "Windblume Ode", 900, ["constructive algorithms", "math", "number theory"]],
    ["1538B", "Friends and Candies", 800, ["greedy", "implementation"]],
    ["1498C", "Planar Reflections", 1700, ["dp", "math"]],
    ["1462C", "Unique Number", 900, ["brute force", "greedy", "math"]],
    ["1397B", "Power Sequence", 1300, ["brute force", "math"]],
  ],
  "ds-segtree": [
    ["1560F2", "Nearest Beautiful Number (hard version)", 1900, ["brute force", "implementation", "math"]],
    ["1541C", "Going Home", 1800, ["brute force", "implementation", "math"]],
    ["1498D", "Bananas in a Microwave", 2100, ["dp", "implementation"]],
    ["1462F", "The Treasure of The Segments", 1600, ["binary search", "data structures", "sortings"]],
    ["1398D", "Colored Rectangles", 1800, ["dp", "greedy", "sortings"]],
  ],
  "ds-segtree-advanced": [
    ["1594F", "Ideal Farm", 2000, ["constructive algorithms", "flows", "math"]],
    ["1555C", "Coin Rows", 1300, ["dp", "greedy"]],
    ["1515D", "Phoenix and Socks", 1800, ["data structures", "greedy", "sortings"]],
    ["1436E", "Complicated Computations", 2100, ["data structures", "implementation", "two pointers"]],
    ["1352G", "Special Permutation", 1300, ["constructive algorithms"]],
  ],
  "ds-block-mo": [
    ["1567B", "MEXor Mixup", 1100, ["bitmasks", "math"]],
    ["1520C", "Do Not Try This Problem", 1100, ["constructive algorithms", "implementation"]],
    ["1455D", "Sequence and Swaps", 1300, ["dp", "greedy", "sortings"]],
    ["1408C", "Binary Search Reconstruction", 1500, ["constructive algorithms", "math"]],
    ["1344B", "Monopole Magnets", 1800, ["constructive algorithms", "dfs and similar", "greedy", "implementation"]],
  ],
};

function main() {
  let current = {};
  if (fs.existsSync(OUTPUT)) {
    try {
      current = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
    } catch (error) {
      console.warn(`[warn] 解析既有 ${path.basename(OUTPUT)} 失败，将全新生成：${error.message}`);
    }
  }
  let added = 0;
  let skipped = 0;
  for (const table of [ADD, ADD2]) {
    for (const [nodeId, entries] of Object.entries(table)) {
      if (!current[nodeId]) current[nodeId] = [];
      const seen = new Set(current[nodeId].map((e) => String(e.number).toUpperCase()));
      for (const [number, name, rating, tags] of entries) {
        const key = String(number).toUpperCase();
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        seen.add(key);
        current[nodeId].push({ number: String(number), name, rating, tags, source: "Codeforces·精选" });
        added += 1;
      }
    }
  }
  const sorted = {};
  for (const id of Object.keys(current).sort()) sorted[id] = current[id];
  fs.writeFileSync(OUTPUT, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  const total = Object.values(sorted).reduce((s, a) => s + a.length, 0);
  console.log(`新增 ${added} 条，跳过重复 ${skipped} 条；${OUTPUT} 共 ${Object.keys(sorted).length} 个节点 ${total} 条`);
  console.log("下一步：node scripts/convert-curriculum.js --force && npm run generate");
}

main();
