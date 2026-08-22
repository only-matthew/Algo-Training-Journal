#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int a[MAXN];
int main(){
    int x, n;
    cin >> n >> x;
    for (int i = 1; i <= n; i++) cin >> a[i];

    long long res = 0;
    for (int i = 1; i < n; i++){
        // for (int i = 1; i <= n; i++) cout << a[i] << " ";
        // cout << "\n";
        if (a[i] + a[i+1] > x){
            res += a[i] + a[i+1] - x;
            if (a[i+1]>a[i]+a[i+1]-x)
                a[i+1] = x - a[i];
            else a[i] = x, a[i+1] = 0;
        } 
    }
    cout << res;
    return 0;
}