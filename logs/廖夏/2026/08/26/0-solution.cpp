#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 3e4;
int p[MAXN];
int main(){
    int n, w;
    cin >> w >> n;
    for (int i = 1; i <= n; i++) cin >> p[i];
    sort(p + 1, p + n + 1);
    int i = 1, j = n;
    int ans = 0;
    while (i <= j){
        if (p[i] + p[j] <= w)
            ans++, j--, i++;
        else ans++, j--;
    }
    cout << ans;
    return 0;
}