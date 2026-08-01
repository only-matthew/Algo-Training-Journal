#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 20 + 5;
int a[MAXN], b[MAXN], c[MAXN], d[MAXN];

int get_price (int *arr, int sz){
    int sum = 0;
    for (int i = 1; i <= sz; i++) sum += arr[i];

    // dp解决的是分组的问题，通过数组存储状态，枚举每一种状态的到达情况
    bool dp[1201] = {}; // dp[]用于存储状态，能否达到 j 的状态
    dp[0] = true;
    for (int i = 1; i <= sz; i++){ // 每次考虑一道新题，判断这道题加入后能产生哪些新状态
        for (int j = sum / 2; j >= arr[i]; j--){ // 我们从sum/2开始寻找，因为如果存在更大的，另一组就更小，重复枚举；从大到小枚举，确保不重复。
            dp[j] = dp[j] || dp[j - arr[i]]; // 如果本身就可以到达，不用管；或可以通过在j - arr[i]的状态选择arr[i]到达
        }
    }

    for (int j = sum / 2; j >= 0; j--)
        if (dp[j]) return sum - j; // 从sum/2开始往小找，现在找到了一个能到达的，那么存在另一边最小的

    return sum;
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