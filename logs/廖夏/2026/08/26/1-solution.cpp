#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 305;
int h[MAXN];
long long res;
int main(){
    int n; cin >> n; for (int i = 1; i <= n; i++) cin >> h[i];
    sort(h + 1, h + n + 1);
    int i = 0, j = n;
    while (i < j){
        res += (h[j] - h[i]) * (h[j] - h[i]);
        i++; 
        res += (h[j] - h[i]) * (h[j] - h[i]);
        j--;
    }
    cout << res;
    return 0;
}