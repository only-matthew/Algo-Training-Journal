#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 20 + 5;
int a[MAXN], b[MAXN], c[MAXN], d[MAXN];

int dfs(int x, int i, int *arr, int target, int sz){
    if (i > sz) return x;
    int skip = dfs(x, i + 1, arr, target, sz);
    int choose = 0;
    if (x + arr[i] <= target)
        choose = dfs(x + arr[i], i + 1, arr, target, sz);
    return max(skip, choose);
}

int get_price(int *arr, int sz){
    int sum = 0;
    for (int i = 1; i <= sz; i++) sum += arr[i];
    return sum - dfs(0, 1, arr, sum / 2, sz);
}

void read(int *arr, int sz){
    for (int i = 1; i <= sz; i++) cin >> arr[i];
}

int main(){
    int s1, s2, s3, s4; cin >> s1 >> s2 >> s3 >> s4;
    read(a, s1); read(b, s2); read(c, s3); read(d, s4);   
    int res = 0;
    res += get_price(a, s1);
    res += get_price(b, s2);
    res += get_price(c, s3);
    res += get_price(d, s4);
    cout << res;
    return 0;
}