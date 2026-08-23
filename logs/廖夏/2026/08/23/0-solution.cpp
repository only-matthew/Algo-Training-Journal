#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 5e3 + 5;
struct Apple{
    int x, y;
};
int a, b;
Apple ap[MAXN];
bool cmp1(Apple A, Apple B){
    if (A.x <= a + b){
        if (B.x <= a + b) return A.y < B.y;
        else return true;
    }
    if (B.x <= a + b) return false;
    else return false;
}
int main(){
    int n, s;
    cin >> n >> s >> a >> b;
    for (int i = 1; i <= n; i++) cin >> ap[i].x >> ap[i].y;
    sort(ap + 1, ap + n + 1, cmp1);
    int i = 1, res = 0;
    while (true){
        if (i > n) break; // 边界处理
        if (ap[i].x > a + b) break;
        if (ap[i].y > s) break;
        s -= ap[i].y;
        i++;
        res++;
    }
    cout << res;
    return 0;
}