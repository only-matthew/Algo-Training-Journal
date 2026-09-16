#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 2e5 + 5;
long long a[MAXN];
int n, k;
bool P(long long x){
    long long sum = 0;
    for (int i = (n+1) / 2; i <= n; i++)
        sum += max(0LL, x - a[i]);
    return sum <= k;
}
int main(){
    cin >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];
    sort(a+1,a+1+n);
    long long l = 1, r = 1e12;
    while (l + 1< r){
        long long m = l + (r - l) / 2;
        if (P(m)) l = m;
        else r = m;
        // cout << l << ": " << r << endl;
    }
    // cout << P(2) << endl;
    cout << l;
    return 0;
}