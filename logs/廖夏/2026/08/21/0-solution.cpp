#include<iostream>
#include<algorithm>
#include<cstring>
using namespace std;
const int MAXN = 1e4 + 5;
int a[MAXN], b[MAXN];
int main(){
    int n; cin >> n;
    memset(a, 127, sizeof(a));
    memset(b, 127, sizeof(b));
    for (int i = 0; i < n; i++) cin >> a[i];
    sort(a, a + n);
    int i = 0; int j = 0;
    int w, sum = 0, tail = 0;
    for (int k = 1; k < n; k++){
        // printf("k:%d \t %d %d\n", k, a[i], b[j]);
        w = a[i] < b[j] ? a[i++] : b[j++];
        w += a[i] < b[j] ? a[i++] : b[j++];
        b[tail++] = w;
        sum += w;
        // printf("k:%d \t %d %d\n", k, a[i], b[j]);
    }
    cout << sum;
    return 0;
}