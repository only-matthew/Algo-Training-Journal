#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int d[MAXN], n;
int main(){
    cin >> n; for (int i = 0; i < n; i++) cin >> d[i];
    int res = 0;
    int head = 0;
    while (1){
        bool is = false;
        int i = head, j = 0;
        while(d[i] <= 0) {i++; if (i >= n) {is = true;break;}}
        head = i;
        if (is) break;
        j = i + 1; while (d[j] > 0) j++; // [i,j)
        int min_ = 1e4 + 1;
        for (int k = i; k < j; k++)
            min_ = min(min_, d[k]);
        for (int k = i; k < j; k++) d[k] -= min_;
        res += min_;
    }
    cout << res;
    return 0;
}