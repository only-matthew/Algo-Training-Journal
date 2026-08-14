#include<iostream>
#include<algorithm>
using namespace std;

/*
P1010 幂次方：n 拆成 2^k 的和，指数也递归拆，直到只剩 2 和 2(0)。
关键分歧：2^1 必须写成 2 而不是 2(1)，所以需要一个兜底特判。
两种写法都正确，差别只在特判的是"值"还是"指数"。

对比：
  expand1（直观版）: 按"值"特判 x=1/2/3，值->答案一一对应，一眼懂，多一个基例。
  expand2（优雅版）: 按"指数"特判 k=0/1，结构与递归对齐，少一个基例，但多一层换算。
*/

// 版本1：直观版 —— 特判放在函数头
void expand1(int x){
    if (x == 1) {cout << "2(0)"; return;}
    if (x == 2) {cout << "2"; return;}
    if (x == 3) {cout << "2+2(0)"; return;}
    int k = 1, m = 2;
    while (m <= x) k++, m *= 2;
    m /= 2, k--;
    cout << "2("; expand1(k); cout << ")";
    if (x - m) {cout << "+"; expand1(x - m);}
}

// 版本2：优雅版 —— 特判按"指数"收尾
void expand2(int x){
    int k = 1, m = 2;
    while (m <= x) k++, m *= 2;
    m /= 2, k--;
    if (!k) {cout << "2(0)"; return;}
    else if (k == 1) cout << "2";
    else {cout << "2("; expand2(k); cout << ")";}
    if (x - m) {cout << "+"; expand2(x - m);}
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0); cout.tie(0);
    int n; cin >> n;
    expand2(n);   // 默认优雅版；想切回直观版改成 expand1
    return 0;
}